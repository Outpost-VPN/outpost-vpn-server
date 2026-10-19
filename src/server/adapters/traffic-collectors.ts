import type {ConnectionCredential, TrafficPoint} from "../models";
import type {TrafficCollector} from "../services/traffic";
import type {ConnectionService} from "../services/connections";
import type {EngineId} from "../../shared/engines";
import {callAgent} from "../services/operations";
import {config} from "../config";
import {engineApi, engineApiSecret} from "./engine-api";
import {amneziaPeer} from "./amneziawg";
import {singBoxSessions} from "./sing-box-telemetry";

export function telemetryConnectionId(user: string) {
  return user.replace(/@outpost\.local$/, "").replace(/\.\d+$/, "");
}

function sessionSnapshot(sessions: Array<{id: string; user?: string; upload: number; download: number; closed?: boolean}>) {
  const online: Record<string, number> = {};
  const traffic = sessions.flatMap((session) => {
    if (!session.user) return [];
    const connectionId = telemetryConnectionId(session.user);
    if (!session.closed) online[connectionId] = (online[connectionId] ?? 0) + 1;
    return [{connectionId, counterId: session.id, upload: session.upload, download: session.download}];
  });
  return {traffic, online};
}

export class HysteriaCollector implements TrafficCollector {
  id = "hysteria" as const;
  intervalMs = 30_000;
  constructor(private url: string, private secret?: string) {}

  async collect() {
    const headers = this.secret ? { authorization: this.secret } : undefined;
    const base = this.url.replace(/\/$/, "");
    const [trafficResponse, onlineResponse] = await Promise.all([
      fetch(`${base}/traffic`, { headers, signal: AbortSignal.timeout(4_000) }),
      fetch(`${base}/online`, { headers, signal: AbortSignal.timeout(4_000) }),
    ]);
    if (!trafficResponse.ok) throw new Error(`Hysteria traffic stats: ${trafficResponse.status}`);
    if (!onlineResponse.ok) throw new Error(`Hysteria online stats: ${onlineResponse.status}`);
    const [traffic, online] = await Promise.all([
      trafficResponse.json() as Promise<Record<string, { tx: number; rx: number }>>,
      onlineResponse.json() as Promise<Record<string, number>>,
    ]);
    return {
      traffic: Object.entries(traffic).map(([connectionId, counters]) => ({ connectionId, upload: counters.tx, download: counters.rx })),
      online,
    };
  }
}

export class XrayCollector implements TrafficCollector {
  id = "xray" as const;
  intervalMs = 30_000;
  constructor(private binary: string, private server = engineApi.xray) {}

  async collect() {
    const process = Bun.spawn([this.binary, "api", "statsquery", `--server=${this.server}`, "-pattern", "user>>>"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => process.kill(), 4_000);
    const [stdout, stderr, code] = await Promise.all([
      new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
    ]);
    clearTimeout(timer);
    if (code !== 0) throw new Error(`Xray stats: ${stderr.trim()}`);
    const counters = parseXrayStats(stdout);
    const points = new Map<string, TrafficPoint>();
    for (const [name, value] of counters) {
      const match = name.match(/^user>>>([^>]+)>>>traffic>>>(uplink|downlink)$/);
      if (!match) continue;
      const email = match[1]!;
      const connectionId = telemetryConnectionId(email);
      const point = points.get(connectionId) ?? { connectionId, upload: 0, download: 0 };
      if (match[2] === "uplink") point.upload += value;
      else point.download += value;
      points.set(connectionId, point);
    }
    return { traffic: Array.from(points.values()) };
  }
}

export function parseXrayStats(output: string) {
  const values = new Map<string, number>();
  try {
    const payload = JSON.parse(output) as { stat?: Array<{ name?: string; value?: string | number }> };
    for (const item of payload.stat ?? []) if (item.name) values.set(item.name, Number(item.value ?? 0));
    return values;
  } catch {
    // Older Xray builds may format the response as protobuf text.
  }
  const matcher = /name:\s*"([^"]+)"\s+value:\s*(\d+)/g;
  for (const match of output.matchAll(matcher)) values.set(match[1]!, Number(match[2]));
  return values;
}

export class MihomoCollector implements TrafficCollector {
  id = "mihomo" as const;
  intervalMs = 5_000;
  constructor(private url = `http://${engineApi.mihomo}`, private secret = engineApiSecret("mihomo")) {}

  async collect() {
    const response = await fetch(`${this.url}/connections`, {
      headers: {authorization: `Bearer ${this.secret}`}, signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`Mihomo telemetry: HTTP ${response.status}`);
    const snapshot = await response.json() as {connections: Array<{
      id: string; metadata: {inboundUser?: string}; upload: number; download: number;
    }>};
    return sessionSnapshot(snapshot.connections.map((session) => ({...session, user: session.metadata.inboundUser})));
  }
}

export class SingBoxCollector implements TrafficCollector {
  id = "sing-box" as const;
  intervalMs = 5_000;
  constructor(private url = `http://${engineApi["sing-box"]}`, private secret = engineApiSecret("sing-box")) {}

  async collect() {
    return sessionSnapshot((await singBoxSessions(this.url, this.secret)).map((session) => ({
      id: session.id, user: session.user, closed: Boolean(session.closedAt), upload: session.uplinkTotal, download: session.downlinkTotal,
    })));
  }
}

export class AmneziaCollector implements TrafficCollector {
  id = "amneziawg" as const;
  intervalMs = 30_000;
  constructor(private credentials: () => ConnectionCredential[], private agent = callAgent) {}

  async collect() {
    // Read only public keys and transfer counters. `dump` would expose keys.
    const result = await this.agent({action: "telemetry.read", payload: {engine: this.id}});
    const users = new Map(this.credentials().map((credential) => [amneziaPeer(credential).publicKey, credential.connectionId]));
    const traffic = String(result.output ?? "").trim().split(/\n/).filter(Boolean).flatMap((line) => {
      const [key, rx, tx] = line.trim().split(/\s+/);
      const connectionId = users.get(key!);
      return connectionId ? [{connectionId, counterId: key, upload: Number(rx), download: Number(tx)}] : [];
    });
    return {traffic};
  }
}

export function configuredCollectors(connections: ConnectionService): TrafficCollector[] {
  if (config.demo) return [];
  const collectors = {
    hysteria: new HysteriaCollector(process.env.OUTPOST_HYSTERIA_STATS_URL ?? `http://${engineApi.hysteria}`, config.hysteriaStatsSecret),
    xray: new XrayCollector(process.env.OUTPOST_XRAY_BINARY ?? "/opt/outpost/engines/xray/current/xray", process.env.OUTPOST_XRAY_API ?? engineApi.xray),
    mihomo: new MihomoCollector(), "sing-box": new SingBoxCollector(), amneziawg: new AmneziaCollector(() => connections.activeCredentials()),
  } satisfies Record<EngineId, TrafficCollector>;
  return Object.values(collectors);
}
