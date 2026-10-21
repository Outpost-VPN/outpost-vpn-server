import {Resolver} from "node:dns/promises";
import {networkInterfaces} from "node:os";
import {BlockList, connect, isIP} from "node:net";
import {checkServerIdentity, connect as tlsConnect} from "node:tls";
import type {DiagnosticRequest, DiagnosticStage} from "../shared/diagnostics";

const blocked = new BlockList(), globalV6 = new BlockList();
export class DiagnosticFailure extends Error {constructor(readonly code: string) {super(code);}}
export function failureCode(error: unknown) {
  const code = error instanceof DiagnosticFailure ? error.code : (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && /^[A-Z_a-z0-9]{1,80}$/.test(code) ? code : "probe_unavailable";
}
for (const [address, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],
  ["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["100.64.0.0",10],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",3],["168.63.129.16",32]] as const) blocked.addSubnet(address,prefix,"ipv4");
for (const [address, prefix] of [["2001::",23],["2001:db8::",32],["2002::",16],["3fff::",20]] as const) blocked.addSubnet(address,prefix,"ipv6");
globalV6.addSubnet("2000::",3,"ipv6");
export function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address,"ipv4") : family === 6 && globalV6.check(address,"ipv6") && !blocked.check(address,"ipv6");
}

export async function resolveTarget(value: string, family: DiagnosticRequest["family"], options: {dnsServer?: string; interface?: string; signal?: AbortSignal} = {}) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new DiagnosticFailure("invalid_target_without_credentials_required");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  options.signal?.throwIfAborted();
  const resolver = new Resolver({timeout: 2000, tries: 1});
  if (options.dnsServer) resolver.setServers([options.dnsServer]);
  if (options.interface) {
    const local = networkInterfaces()[options.interface] ?? [];
    resolver.setLocalAddress(local.find(row => row.family === "IPv4")?.address ?? "0.0.0.0", local.find(row => row.family === "IPv6")?.address ?? "::");
  }
  const cancel = () => resolver.cancel();
  options.signal?.addEventListener("abort", cancel, {once: true});
  let addresses: string[];
  try {addresses = isIP(host) ? [host] : await (family === "ipv4" ? resolver.resolve4(host) : resolver.resolve6(host));}
  finally {options.signal?.removeEventListener("abort", cancel);}
  options.signal?.throwIfAborted();
  if (!addresses.length || addresses.some(address => !publicAddress(address) || isIP(address) !== (family === "ipv4" ? 4 : 6))) throw new DiagnosticFailure("public_addresses_required");
  return {url, address: addresses[0]!, port: Number(url.port || (url.protocol === "https:" ? 443 : 80)), host};
}
export type ProbeTarget = Awaited<ReturnType<typeof resolveTarget>>;

export async function command(argv: string[], signal: AbortSignal, timeoutMs: number, input?: Uint8Array, maximumOutput = 128 * 1024, capture: "stdout" | "stderr" = "stdout") {
  signal.throwIfAborted();
  const child = Bun.spawn(argv, {stdin: input ?? "ignore", stdout: capture === "stdout" ? "pipe" : "ignore", stderr: capture === "stderr" ? "pipe" : "ignore", env: {...process.env, LC_ALL: "C"}});
  const stop = () => child.kill("SIGKILL");
  const timer = setTimeout(stop, timeoutMs);
  signal.addEventListener("abort", stop, {once: true});
  if (signal.aborted) stop();
  try {
    const reader = (capture === "stdout" ? child.stdout! : child.stderr!).getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximumOutput) {stop(); throw new Error("Diagnostic output limit exceeded");}
      chunks.push(value);
    }
    const code = await child.exited;
    signal.throwIfAborted();
    return {code, output: Buffer.concat(chunks).toString("utf8")};
  } finally {clearTimeout(timer); signal.removeEventListener("abort", stop); if (child.exitCode === null) {stop(); await child.exited;}}
}

export function socketProbe(target: ProbeTarget, tls: boolean, signal: AbortSignal) {
  return new Promise<{ok: boolean; code?: string}>((resolve) => {
    signal.throwIfAborted();
    const socket = tls ? tlsConnect({host: target.address, port: target.port, servername: isIP(target.host) ? undefined : target.host,
      rejectUnauthorized: true, ...(isIP(target.host) ? {checkServerIdentity: (_name, certificate) => checkServerIdentity(target.host, certificate)} : {})})
      : connect({host: target.address, port: target.port});
    let finished = false;
    const finish = (ok: boolean, code?: string) => {if (finished) return; finished = true; socket.destroy(); signal.removeEventListener("abort", cancel); resolve({ok, ...(code ? {code} : {})});};
    const cancel = () => finish(false, "cancelled");
    signal.addEventListener("abort", cancel, {once: true});
    socket.setTimeout(4_000);
    socket.once(tls ? "secureConnect" : "connect", () => finish(true));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (error: NodeJS.ErrnoException) => finish(false, error.code ?? "connection_error"));
  });
}

const boundedCurl = new Set<string>();
export async function transfer(target: ProbeTarget, request: DiagnosticRequest, direction: "download" | "upload" | "http", signal: AbortSignal,
  options: {socksPort?: number; interface?: string; curl?: string} = {}): Promise<Pick<DiagnosticStage, "ok" | "code" | "metrics">> {
  const curl = options.curl ?? "curl";
  if (!boundedCurl.has(curl)) {
    const result = await command([curl, "--disable", "--version"], signal, 2000, undefined, 8192);
    const version = result.output.match(/^curl (\d+)\.(\d+)/);
    // Older curl ignores --max-filesize for responses without Content-Length.
    if (result.code !== 0 || !version || Number(version[1]) < 8 || Number(version[1]) === 8 && Number(version[2]) < 4) throw new DiagnosticFailure("curl_8_4_required");
    boundedCurl.add(curl);
  }
  const address = isIP(target.address) === 6 ? `[${target.address}]` : target.address;
  const argv = [curl, "--disable", "--globoff", "--silent", "--show-error", "--noproxy", "*", "--proxy", "", "--proto", "=http,https",
    "--connect-timeout", "4", "--max-time", String(request.durationSeconds), "--max-filesize", String(request.byteLimit),
    "--output", process.platform === "win32" ? "NUL" : "/dev/null", "--write-out", "%{json}"];
  if (!isIP(target.host)) argv.push("--resolve", `${target.host}:${target.port}:${address}`);
  if (options.socksPort) argv.push("--socks5", `127.0.0.1:${options.socksPort}`, "--noproxy", "");
  else if (options.interface) argv.push("--interface", options.interface);
  if (direction === "upload") argv.push("--header", "Expect:", "--data-binary", "@-");
  else argv.push("--range", `0-${direction === "http" ? Math.min(65_535, request.byteLimit - 1) : request.byteLimit - 1}`);
  argv.push(target.url.href);
  const response = await command(argv, signal, (request.durationSeconds + 2) * 1000, direction === "upload" ? new Uint8Array(request.byteLimit) : undefined);
  let stats: Record<string, number>;
  try {stats = JSON.parse(response.output);} catch {return {ok: false, code: "curl_no_result", metrics: {exitCode: response.code}};}
  const successfulHttp = stats.http_code! >= 200 && stats.http_code! < 300;
  const bytes = direction === "upload" ? stats.size_upload ?? 0 : stats.size_download ?? 0;
  const bounded = successfulHttp && bytes > 0 && [0, 28, 63].includes(response.code);
  return {ok: direction === "http" ? response.code === 0 && successfulHttp : bounded,
    code: response.code === 0 ? "completed" : response.code === 28 ? "time_limit" : response.code === 63 ? "byte_limit" : `curl_${response.code}`,
    metrics: {httpStatus: stats.http_code ?? 0, bytes, elapsedMs: (stats.time_total ?? 0) * 1000,
      mbps: (direction === "upload" ? stats.speed_upload ?? 0 : stats.speed_download ?? 0) * 8 / 1_000_000,
      tcpMs: (stats.time_connect ?? 0) * 1000, tlsMs: (stats.time_appconnect ?? 0) * 1000,
      firstByteMs: (stats.time_starttransfer ?? 0) * 1000, complete: response.code === 0}};
}

export async function latency(target: ProbeTarget, count: number, signal: AbortSignal, networkInterface?: string) {
  const ipv6 = isIP(target.address) === 6, mac = process.platform === "darwin";
  const argv = [mac && ipv6 ? "ping6" : "ping", ...(ipv6 && !mac ? ["-6"] : []),
    ...(networkInterface ? [mac ? ipv6 ? "-B" : "-b" : "-I", networkInterface] : []), "-n", "-c", String(count), "-i", "0.2",
    // macOS ping6 uses -W for a different ICMP query, without a timeout argument.
    ...(!mac || !ipv6 ? ["-W", mac ? "1000" : "1"] : []), target.address];
  const {code, output} = await command(argv, signal, count * 1200 + 2000);
  const summary = output.match(/(\d+) packets transmitted,\s*(\d+) (?:packets )?received[^\n]*?([\d.]+)% packet loss/);
  const timings = [...output.matchAll(/time[=<]([\d.]+)\s*ms/g)].map(m => Number(m[1]));
  const mean = timings.length ? timings.reduce((a, b) => a + b, 0) / timings.length : null;
  return {ok: !!summary && Number(summary[2]) > 0, code: summary ? "measured" : "icmp_unavailable", metrics: {
    sent: summary ? Number(summary[1]) : null, received: summary ? Number(summary[2]) : null, icmpLossPercent: summary ? Number(summary[3]) : null,
    minMs: timings.length ? Math.min(...timings) : null, maxMs: timings.length ? Math.max(...timings) : null, meanMs: mean,
    jitterMs: timings.length > 1 ? timings.slice(1).reduce((sum, n, i) => sum + Math.abs(n - timings[i]!), 0) / (timings.length - 1) : null, exitCode: code,
  }};
}

export async function runProbes(request: DiagnosticRequest, signal: AbortSignal, emit: (stage: DiagnosticStage) => Promise<void> | void,
  options: {interface?: string; socksPort?: number; methodId?: string; curl?: string; dnsServer?: string} = {}) {
  const publish = (stage: DiagnosticStage) => emit({...stage, ...(options.methodId ? {methodId: options.methodId} : {}), metrics: {...stage.metrics,
    measurementPath: request.vantage === "server" ? "server-to-origin" : options.socksPort ? "client-via-vpn-to-origin" : "client-to-origin"}});
  const stage = async (type: DiagnosticStage["type"], run: () => Promise<Pick<DiagnosticStage, "ok" | "code" | "metrics">>, attempt?: number) => {
    signal.throwIfAborted();
    const sampledAt = Date.now();
    let result: Pick<DiagnosticStage, "ok" | "code" | "metrics">;
    try {result = await run();} catch (error) {signal.throwIfAborted(); result = {ok: false, code: failureCode(error), metrics: type === "icmp" ? {icmpLossPercent: null, sent: null, received: null} : {}};}
    await publish({type, sampledAt, elapsedMs: Date.now() - sampledAt, ...result, ...(attempt ? {attempt} : {})});
    return result.ok;
  };
  let target: ProbeTarget | undefined;
  const resolved = await stage("dns", async () => {target = await resolveTarget(request.target, request.family, {...options, signal}); return {ok: true, metrics: {address: target.address, family: request.family}};});
  if (!resolved || !target) return;
  if (request.kind === "latency") {await stage("icmp", () => latency(target!, request.count, signal, options.interface)); return;}
  if (request.kind === "reachability") {
    if (options.interface) {
      const sampledAt = Date.now(), result = await transfer(target, request, "http", signal, options);
      const tcp = Number(result.metrics.tcpMs ?? 0) > 0, tls = Number(result.metrics.tlsMs ?? 0) > 0;
      await publish({type: "tcp", sampledAt, elapsedMs: Number(result.metrics.tcpMs ?? 0), ok: tcp, code: tcp ? "connected" : result.code, metrics: {}});
      if (!tcp) return;
      if (target.url.protocol === "https:") {
        await publish({type: "tls", sampledAt, elapsedMs: Number(result.metrics.tlsMs ?? 0), ok: tls, code: tls ? "connected" : result.code, metrics: {}});
        if (!tls) return;
      }
      await publish({type: "http", sampledAt, elapsedMs: Date.now() - sampledAt, ...result});
      return;
    }
    if (!await stage("tcp", () => socketProbe(target!, false, signal).then(v => ({...v, metrics: {}})))) return;
    if (target.url.protocol === "https:" && !await stage("tls", () => socketProbe(target!, true, signal).then(v => ({...v, metrics: {}})))) return;
    await stage("http", () => transfer(target!, request, "http", signal, options)); return;
  }
  for (let attempt = 1; attempt <= request.repeat; attempt++) {
    if (request.direction !== "upload") await stage("download", () => transfer(target!, request, "download", signal, options), attempt);
    if (request.direction !== "download") await stage("upload", async () => transfer(await resolveTarget(request.uploadTarget, request.family, {...options, signal}), request, "upload", signal, options), attempt);
  }
}
