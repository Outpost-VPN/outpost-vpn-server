import {mkdtempSync, writeFileSync, rmSync, chmodSync} from "node:fs";
import {tmpdir, networkInterfaces} from "node:os";
import {join} from "node:path";
import {createServer, connect} from "node:net";
import YAML from "yaml";
import {OutpostApi} from "../shared/api";
import {diagnosticReportSchema, type DiagnosticProfile, type DiagnosticRequest, type DiagnosticStage, type DiagnosticReport} from "../shared/diagnostics";
import {command, resolveTarget, runProbes} from "./probes";
import relaySource from "./udp_relay.py" with {type: "text"};

type RunnerOptions = {interface: string; mihomo?: string; singBox?: string; hysteria?: string; python?: string; curl?: string; dnsServer?: string; onProgress?: (report: DiagnosticReport) => Promise<void>};

export function nativeConfig(profile: DiagnosticProfile, port: number, networkInterface: string) {
  if (profile.family === "mihomo") return {"socks-port": port, "bind-address": "127.0.0.1", "allow-lan": false, mode: "rule", "log-level": "silent",
    ipv6: true, tun: {enable: false}, dns: {enable: false}, proxies: [{...profile.config, name: "diagnostic", "interface-name": networkInterface}], rules: ["MATCH,diagnostic"]};
  return {log: {disabled: true}, inbounds: [{type: "socks", listen: "127.0.0.1", listen_port: port}],
    outbounds: [{...profile.config, tag: "diagnostic", bind_interface: networkInterface}], route: {final: "diagnostic"}};
}

async function port() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {server.once("error", reject); server.listen(0, "127.0.0.1", resolve);});
  const value = (server.address() as {port: number}).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return value;
}

async function wait(port: number, child: Bun.Subprocess, signal: AbortSignal) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    signal.throwIfAborted();
    if (child.exitCode !== null) throw new Error("Diagnostic client exited");
    const connected = await new Promise<boolean>(resolve => {
      const socket = connect({host: "127.0.0.1", port});
      socket.setTimeout(100);
      const finish = (ok: boolean) => {socket.destroy(); resolve(ok);};
      socket.once("connect", () => finish(true)); socket.once("error", () => finish(false)); socket.once("timeout", () => finish(false));
    });
    if (connected) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Diagnostic client did not start");
}

async function bindProfile(profile: DiagnosticProfile, request: DiagnosticRequest, options: RunnerOptions, signal: AbortSignal) {
  const value = structuredClone(profile);
  if (value.family === "hysteria") {
    const target = await resolveTarget(`https://${String(value.config.server)}`, request.family, {...options, signal});
    value.config.server = `${target.address.includes(":") ? `[${target.address}]` : target.address}:${target.port}`;
  } else {
    const target = await resolveTarget(`https://${String(value.config.server).includes(":") ? `[${value.config.server}]` : value.config.server}:${value.config.port ?? value.config.server_port}`, request.family, {...options, signal});
    value.config.server = target.address;
  }
  return value;
}

async function tunnel(profile: DiagnosticProfile, request: DiagnosticRequest, options: RunnerOptions, signal: AbortSignal, run: (socksPort: number) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "outpost-diagnostic-")); chmodSync(directory, 0o700);
  let child: Bun.Subprocess | undefined;
  const stop = () => child?.kill("SIGKILL");
  try {
    const selected = await bindProfile(profile, request, options, signal), socksPort = await port();
    const file = join(directory, "client.json");
    writeFileSync(file, JSON.stringify(nativeConfig(selected, socksPort, options.interface)), {mode: 0o600});
    child = Bun.spawn(profile.family === "mihomo" ? [options.mihomo ?? "mihomo", "-d", directory, "-f", file] : [options.singBox ?? "sing-box", "run", "-c", file], {stdout: "ignore", stderr: "ignore"});
    signal.addEventListener("abort", stop, {once: true});
    await wait(socksPort, child, signal);
    await run(socksPort);
  } finally {
    signal.removeEventListener("abort", stop); stop(); if (child) await child.exited;
    rmSync(directory, {recursive: true, force: true});
  }
}

async function hysteriaSpeed(profile: DiagnosticProfile, request: DiagnosticRequest, options: RunnerOptions, signal: AbortSignal): Promise<Pick<DiagnosticStage, "ok" | "code" | "metrics">> {
  const directory = mkdtempSync(join(tmpdir(), "outpost-speedtest-")); chmodSync(directory, 0o700);
  let relay: Bun.Subprocess<"pipe", "pipe", "ignore"> | undefined;
  const stop = () => relay?.kill("SIGKILL");
  try {
    const selected = await bindProfile(profile, request, options, signal);
    if (process.platform === "darwin") {
      const target = new URL(`https://${selected.config.server}`);
      relay = Bun.spawn([options.python ?? "python3", "-u", "-c", relaySource, options.interface, target.hostname.replace(/^\[|\]$/g, ""), target.port || "443"], {stdin: "pipe", stdout: "pipe", stderr: "ignore"});
      signal.addEventListener("abort", stop, {once: true});
      const reader = relay.stdout.getReader();
      const read = async () => {
        let data = "";
        while (!data.includes("\n")) {
          const response = await reader.read();
          if (!response.value) throw new Error("UDP relay unavailable");
          data += new TextDecoder().decode(response.value);
          if (data.length > 512) throw new Error("Invalid UDP relay response");
        }
        return JSON.parse(data.split("\n")[0]!).port;
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      let port: number;
      try {port = await Promise.race([read(), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error("UDP relay startup timeout")), 3000);})]);}
      finally {clearTimeout(timer); reader.releaseLock();}
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid UDP relay port");
      selected.config.server = `127.0.0.1:${port}`;
    } else if (process.platform === "linux") selected.config.quic = {sockopts: {bindInterface: options.interface}};
    else throw new Error("Interface-bound native speedtest requires Linux or macOS");
    const file = join(directory, "client.yaml");
    writeFileSync(file, YAML.stringify(selected.config), {mode: 0o600});
    const argv = [options.hysteria ?? "hysteria", "speedtest", "-c", file, "--log-format", "json", "--log-level", "info", "--disable-update-check", "--data-size", String(request.byteLimit)];
    if (request.direction === "download") argv.push("--skip-upload");
    if (request.direction === "upload") argv.push("--skip-download");
    const result = await command(argv, signal, request.durationSeconds * (request.direction === "both" ? 2 : 1) * 1000 + 5000, undefined, 128 * 1024, "stderr");
    const metrics = hysteriaMeasurements(result.output);
    const complete = (request.direction === "upload" || metrics.downloadBytes === request.byteLimit) && (request.direction === "download" || metrics.uploadBytes === request.byteLimit);
    return {ok: result.code === 0 && complete, code: result.code === 0 && complete ? "completed" : "native_speedtest_failed", metrics: {...metrics, exitCode: result.code}};
  } finally {signal.removeEventListener("abort", stop); stop(); if (relay) await relay.exited; rmSync(directory, {recursive: true, force: true});}
}

export function hysteriaMeasurements(output: string) {
  const metrics: Record<string, number> = {};
  for (const line of output.split("\n")) {
    let row: {msg?: string; bytes?: number; speed?: string};
    try {row = JSON.parse(line);} catch {continue;}
    if (!["download complete", "upload complete"].includes(row.msg ?? "") || !Number.isSafeInteger(row.bytes)) continue;
    const speed = row.speed?.match(/^([\d.]+)\s*([KMGT]?)bps$/i);
    if (!speed) continue;
    const direction = row.msg!.split(" ")[0]!;
    metrics[`${direction}Mbps`] = Number(speed[1]) * ({"": 1e-6, K: 1e-3, M: 1, G: 1000, T: 1e6}[speed[2]!.toUpperCase()] ?? 1);
    metrics[`${direction}Bytes`] = row.bytes!;
  }
  return metrics;
}

export async function runClient(request: DiagnosticRequest, profiles: DiagnosticProfile[], options: RunnerOptions, signal: AbortSignal): Promise<DiagnosticReport> {
  if (!options.interface || !networkInterfaces()[options.interface]) throw new Error("Select an existing physical network interface");
  const stages: DiagnosticStage[] = [], startedAt = Date.now();
  const result = (): DiagnosticReport => ({stages: [...stages], runner: {platform: process.platform, interface: options.interface, startedAt, finishedAt: Date.now()}});
  const record = async (stage: DiagnosticStage) => {stages.push(stage); await options.onProgress?.(result());};
  if (!profiles.length || request.kind === "compare") await runProbes({...request, kind: request.kind === "compare" ? "speed" : request.kind}, signal, record, {...options, methodId: "direct"});
  for (const profile of profiles) {
    signal.throwIfAborted();
    const at = Date.now();
    try {
      if (request.kind === "transport-speed") {
        for (let attempt = 1; attempt <= request.repeat; attempt++) {
          const sampledAt = Date.now(), result = await hysteriaSpeed(profile, request, options, signal);
          await record({type: "transport-speed", methodId: profile.methodId, attempt, sampledAt, elapsedMs: Date.now() - sampledAt, ...result, metrics: {...result.metrics, measurementPath: "client-to-vpn-server"}});
        }
      } else await tunnel(profile, request, options, signal, socksPort => runProbes({...request, kind: "speed"}, signal, record, {...options, socksPort, methodId: profile.methodId}));
    } catch {
      signal.throwIfAborted();
      await record({type: "client", methodId: profile.methodId, sampledAt: at, elapsedMs: Date.now() - at, ok: false, code: "native_client_unavailable", metrics: {}});
    }
  }
  return diagnosticReportSchema.parse(result());
}

export async function remoteDiagnostic(api: OutpostApi, id: string, options: RunnerOptions, external = new AbortController().signal) {
  const claim = await api.post<{request: DiagnosticRequest; profiles: DiagnosticProfile[]; reportToken: string}>(`/api/v1/diagnostics/${id}/claim`);
  const cancel = new AbortController(), signal = AbortSignal.any([external, cancel.signal, AbortSignal.timeout(300_000)]);
  let checking = false;
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {const operation = await api.get<{status: string}>(`/api/v1/diagnostics/${id}`); if (operation.status !== "running") cancel.abort();} catch {cancel.abort();} finally {checking = false;}
  }, 1000);
  try {
    const report = await runClient(claim.request, claim.profiles, {...options, onProgress: async report => {
      await api.post(`/api/v1/diagnostics/${id}/report`, {reportToken: claim.reportToken, report, complete: false});
    }}, signal);
    await api.post(`/api/v1/diagnostics/${id}/report`, {reportToken: claim.reportToken, report});
    return {operationId: id, ...report};
  } catch (error) {
    await api.post(`/api/v1/diagnostics/${id}/cancel`).catch(() => {});
    throw error;
  } finally {clearInterval(timer);}
}
