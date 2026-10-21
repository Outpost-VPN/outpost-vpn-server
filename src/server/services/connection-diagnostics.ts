import type {OutpostDatabase} from "../db/database";
import {ConnectionService} from "./connections";
import {callAgent} from "./operations";
import {engines, type EngineId} from "../../shared/engines";

export class ConnectionDiagnostics {
  constructor(private db: OutpostDatabase, private connections: ConnectionService, private agent = callAgent) {}

  async get(id: string, includeEvents = false) {
    const connection = this.connections.get(id), at = Date.now();
    const telemetry = this.db.engines.installed().map(engine => {
      const monitor = this.db.raw.query<{status: string; failures: number; data_json: string; observed_at: string; changed_at: string}, string>("SELECT * FROM monitor_states WHERE key = ?").get(`telemetry:${engine}`);
      const presence = connection.presence?.engines[engine];
      let error: string | null = null;
      if (monitor?.status === "unavailable") {
        // The collector already stores safeCollectorError; never return engine secrets or raw responses.
        const stored = JSON.parse(monitor.data_json) as {error?: string};
        error = typeof stored.error === "string" && !/(?:https?:\/\/|password|bearer|secret|token)/i.test(stored.error) ? stored.error.slice(0, 300) : "Collector unavailable";
      }
      const sampledAt = monitor ? Date.parse(monitor.observed_at) : null;
      return {engine, presence: presence ?? null, collector: {status: monitor?.status ?? "unknown", failures: monitor?.failures ?? 0,
        sampledAt, ageMs: sampledAt === null ? null : Math.max(0, at - sampledAt), stale: sampledAt === null || at - sampledAt > 90_000, error}};
    });
    const reasons = telemetry.filter(row => row.collector.status !== "available" || row.collector.stale || !row.presence)
      .map(row => ({engine: row.engine, reason: row.collector.stale ? "stale_telemetry" : !row.presence ? "no_observation" : "collector_unavailable"}));
    const recentEvents = includeEvents ? await Promise.all(this.db.engines.installed().map(async (engine: EngineId) => {
      try {
        const result = await this.agent({action: "logs.read", payload: {engine, connectionId: id, since: at - 60 * 60_000, limit: 25}});
        return {engine, service: engines[engine].service, status: "available", ...JSON.parse(String(result.output))};
      } catch {return {engine, status: "unavailable", events: []};}
    })) : undefined;
    return {connectionId: id, name: connection.name, sampledAt: at, presence: connection.presence, telemetry, reasons,
      ...(recentEvents ? {recentEvents} : {}), precision: {hysteria: "session snapshot", mihomo: "session snapshot", "sing-box": "session snapshot", xray: "recent traffic delta", amneziawg: "recent traffic delta"},
      quic: {available: false, rttMs: null, lossPercent: null, reason: "Not exported by the current Hysteria stats API"}};
  }
}
