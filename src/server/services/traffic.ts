import type { OutpostDatabase } from "../db/database";
import type { EngineId, PresenceStatus, TrafficPoint } from "../models";
import {telemetryEngines} from "../../shared/engines";
import { JournalService } from "./journal";
import {ConnectionService, ServiceError} from "./connections";

export interface TelemetrySnapshot {
  traffic: TrafficPoint[];
  online?: Record<string, number>;
}

export interface TrafficCollector {
  id: EngineId;
  intervalMs?: number;
  collect(): Promise<TelemetrySnapshot>;
}

export type TrafficPeriod = "today" | "24h" | "week" | "7d" | "month" | "30d" | "year" | "365d" | "all";

export class TrafficService {
  private journal: JournalService;
  private connections: ConnectionService;
  private sampledAt = new Map<EngineId, number>();
  private compactedAt = 0;
  private collecting = false;

  constructor(
    private db: OutpostDatabase,
    private collectors: TrafficCollector[] = [],
    journal?: JournalService,
    private enabled = true,
  ) {
    this.journal = journal ?? new JournalService(db);
    this.connections = new ConnectionService(db, this.journal);
  }

  async collect(reference = new Date()) {
    if (!this.enabled || this.collecting) return;
    this.collecting = true;
    try {
      await Promise.all(this.collectors.filter((collector) => this.db.engines.has(collector.id)).map(async (collector) => {
        const previous = this.sampledAt.get(collector.id);
        if (previous !== undefined && reference.getTime() - previous < (collector.intervalMs ?? 0)) return;
        this.sampledAt.set(collector.id, reference.getTime());
        try {
          const snapshot = await collector.collect();
          const active = new Set<string>();
          for (const point of snapshot.traffic) {
            const delta = this.recordCumulative(collector.id, point, reference);
            if (delta.activity) active.add(point.connectionId);
          }
          this.updatePresence(collector.id, snapshot.online, active, reference);
          this.telemetrySuccess(collector.id, reference);
        } catch (error) {
          this.markUnknown(collector.id, reference);
          this.telemetryFailure(collector.id, error, reference);
        }
      }));
      this.updateActivityFacts(reference);
      if (reference.getTime() - this.compactedAt >= 5 * 60_000) {
        this.compact(reference);
        this.compactedAt = reference.getTime();
      }
    } finally { this.collecting = false; }
  }

  recordCumulative(engine: string, point: TrafficPoint, observedAt = new Date()) {
    if (![point.upload, point.download].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error("Invalid traffic counters");
    const connection = this.db.raw.query<{ id: string }, string>("SELECT id FROM connections WHERE id = ?").get(point.connectionId);
    if (!connection) return { upload: 0, download: 0, activity: false, reset: false };
    const cursor = this.db.raw.query<{ upload: number; download: number }, [string, string, string]>(`
      SELECT upload, download FROM traffic_cursors WHERE connection_id = ? AND engine = ? AND counter_id = ?
    `).get(point.connectionId, engine, point.counterId ?? "");
    const reset = Boolean(cursor && (point.upload < cursor.upload || point.download < cursor.download));
    const upload = cursor && point.upload >= cursor.upload ? point.upload - cursor.upload : point.upload;
    const download = cursor && point.download >= cursor.download ? point.download - cursor.download : point.download;
    const bucketAt = floorDate(observedAt, 5).toISOString();
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        INSERT INTO traffic_cursors (connection_id, engine, counter_id, upload, download, observed_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(connection_id, engine, counter_id) DO UPDATE SET
          upload = excluded.upload, download = excluded.download, observed_at = excluded.observed_at
      `).run(point.connectionId, engine, point.counterId ?? "", point.upload, point.download, observedAt.toISOString());
      if (upload || download) {
        this.db.raw.query(`
          INSERT INTO traffic_samples (bucket, bucket_at, connection_id, engine, upload, download)
          VALUES ('5m', ?, ?, ?, ?, ?)
          ON CONFLICT(bucket, bucket_at, connection_id, engine) DO UPDATE SET
            upload = upload + excluded.upload, download = download + excluded.download
        `).run(bucketAt, point.connectionId, engine, upload, download);
      }
    })();
    return { upload, download, activity: Boolean(cursor && !reset && (upload > 0 || download > 0)), reset };
  }

  overview(period: TrafficPeriod = "30d", timeZone = "UTC", options: {
    connectionId?: string; from?: string; to?: string; includeSeries?: boolean; resolution?: "auto" | "5m" | "1h" | "1d"; maxPoints?: number;
  } = {}) {
    const reference = new Date(), since = options.from ?? periodStart(period, timeZone, reference), until = options.to ?? reference.toISOString();
    if ((since && !Number.isFinite(Date.parse(since))) || !Number.isFinite(Date.parse(until)) || (since && Date.parse(since) > Date.parse(until))) throw new ServiceError(400, "Invalid traffic time range");
    const clauses = ["bucket_at <= ?"], params: Array<string | number> = [until];
    if (since) {clauses.push("bucket_at >= ?"); params.push(since);}
    if (options.connectionId) {clauses.push("connection_id = ?"); params.push(options.connectionId);}
    const where = `WHERE ${clauses.join(" AND ")}`;
    const totals = this.db.raw.query<{upload: number; download: number}, Array<string | number>>(`
      SELECT COALESCE(SUM(upload),0) AS upload, COALESCE(SUM(download),0) AS download FROM traffic_samples ${where}
    `).get(...params)!;
    const rows = this.db.raw.query<{connection_id: string; upload: number; download: number}, Array<string | number>>(`
      SELECT connection_id,SUM(upload) AS upload,SUM(download) AS download FROM traffic_samples ${where} GROUP BY connection_id
    `).all(...params);
    const earliest = since ?? this.db.raw.query<{at: string | null}, Array<string | number>>(`SELECT MIN(bucket_at) AS at FROM traffic_samples ${where}`).get(...params)?.at ?? until;
    const maxPoints = Math.max(1, Math.min(1000, options.maxPoints ?? 200));
    const requested = {"5m": 300_000, "1h": 3_600_000, "1d": 86_400_000}[options.resolution as "5m" | "1h" | "1d"];
    const originMs = requested ? 0 : Math.floor(Date.parse(earliest) / 300_000) * 300_000;
    const resolutionMs = requested ?? Math.max(300_000, Math.ceil((Date.parse(until) - originMs + 1) / maxPoints / 300_000) * 300_000);
    const seriesRows = options.includeSeries === false ? [] : this.db.raw.query<{connection_id: string; at: number; upload: number; download: number}, Array<string | number>>(`
      SELECT connection_id,CAST((unixepoch(bucket_at)*1000-${originMs})/${resolutionMs} AS INTEGER)*${resolutionMs}+${originMs} AS at,
        SUM(upload) AS upload,SUM(download) AS download FROM traffic_samples ${where} GROUP BY connection_id,at ORDER BY at
    `).all(...params);
    const seriesFor = (id?: string) => {
      const points = new Map<number, {bucket_at: string; upload: number; download: number}>();
      for (const row of seriesRows) {
        if (id && row.connection_id !== id) continue;
        const point = points.get(row.at) ?? {bucket_at: new Date(row.at).toISOString(), upload: 0, download: 0};
        point.upload += row.upload; point.download += row.download; points.set(row.at, point);
      }
      const values = [...points.values()];
      if (values.length > maxPoints && requested) throw new ServiceError(400, "Traffic series exceeds maxPoints; use auto resolution");
      return values;
    };
    const connections = this.connections.list().filter(c => !c.archived_at && (!options.connectionId || c.id === options.connectionId)).map(c => ({
      connection_id: c.id, name: c.name, upload: rows.find(row => row.connection_id === c.id)?.upload ?? 0,
      download: rows.find(row => row.connection_id === c.id)?.download ?? 0, series: seriesFor(c.id),
    })).sort((a,b) => b.upload + b.download - a.upload - a.download);
    return {period, from: since, to: until, totals, connections, series: seriesFor(), resolutionMs,
      coveredEngines: telemetryEngines, retention: {fiveMinuteHours: 48, hourlyDays: 90}};
  }

  compact(reference = new Date()) {
    const fiveMinuteCutoff = new Date(reference.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const hourlyCutoff = new Date(reference.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    this.rollup("5m", "1h", fiveMinuteCutoff, 60);
    this.rollup("1h", "1d", hourlyCutoff, 24 * 60);
    this.db.raw.query("DELETE FROM traffic_samples WHERE bucket = '5m' AND bucket_at < ?").run(fiveMinuteCutoff);
    this.db.raw.query("DELETE FROM traffic_samples WHERE bucket = '1h' AND bucket_at < ?").run(hourlyCutoff);
    this.db.raw.query("DELETE FROM traffic_cursors WHERE engine IN ('mihomo', 'sing-box') AND observed_at < ?").run(fiveMinuteCutoff);
  }

  seedDemo() {
    const connections = this.activeConnections();
    if (!connections.length) return;
    const existing = this.db.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM traffic_samples").get()?.count ?? 0;
    if (existing) {
      this.vary(connections.map((connection) => connection.id));
      return;
    }
    const cumulative = new Map<string, { upload: number; download: number }>();
    for (let i = 288; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 5 * 60 * 1000);
      for (const [index, connection] of connections.entries()) {
        const weight = [1, 0.58, 0.27][index] ?? Math.max(0.1, 0.2 / index);
        const value = cumulative.get(connection.id) ?? { upload: 0, download: 0 };
        value.upload += Math.floor((1 + Math.sin(i / 17)) * 90_000 * weight);
        value.download += Math.floor((1 + Math.cos(i / 13)) * 540_000 * weight);
        cumulative.set(connection.id, value);
        this.recordCumulative(i % 2 ? "hysteria" : "xray", { connectionId: connection.id, ...value }, date);
      }
    }
  }

  private vary(connectionIds: string[]) {
    if (connectionIds.length < 2) return;
    const totals = connectionIds.map((id) => this.db.raw.query<{ total: number }, string>(`
      SELECT COALESCE(SUM(upload + download), 0) AS total
      FROM traffic_samples WHERE connection_id = ?
    `).get(id)?.total ?? 0);
    if (!totals[0] || !totals.every((total) => total === totals[0])) return;
    this.db.raw.transaction(() => {
      connectionIds.slice(1).forEach((id, offset) => {
        const weight = [0.58, 0.27][offset] ?? Math.max(0.1, 0.2 / (offset + 1));
        this.db.raw.query(`
          UPDATE traffic_samples
          SET upload = CAST(upload * ? AS INTEGER), download = CAST(download * ? AS INTEGER)
          WHERE connection_id = ?
        `).run(weight, weight, id);
      });
    })();
  }

  private updatePresence(engine: EngineId, online: Record<string, number> | undefined, active: Set<string>, reference: Date) {
    const timestamp = reference.toISOString();
    for (const connection of this.activeConnections()) {
      const previous = this.presence(connection.id, engine);
      if (online) {
        const connections = Math.max(0, Math.trunc(Number(online[connection.id] ?? 0)));
        const misses = connections ? 0 : (previous?.misses ?? 0) + 1;
        this.savePresence(connection.id, engine, connections ? "online" : misses >= 2 ? "offline" : previous?.status ?? "unknown", "connections", timestamp, {
          connections, misses, lastActiveAt: connections ? timestamp : previous?.last_active_at ?? null,
        });
      } else {
        const lastActiveAt = active.has(connection.id) ? timestamp : previous?.last_active_at ?? null;
        const recent = lastActiveAt !== null && reference.getTime() - new Date(lastActiveAt).getTime() <= 2 * 60 * 1000;
        this.savePresence(connection.id, engine, recent ? "online" : "offline", "traffic", timestamp, {
          connections: null, misses: 0, lastActiveAt,
        });
      }
    }
  }

  private markUnknown(engine: EngineId, reference: Date) {
    const timestamp = reference.toISOString();
    for (const connection of this.activeConnections()) {
      const previous = this.presence(connection.id, engine);
      this.savePresence(connection.id, engine, "unknown", engine === "hysteria" ? "connections" : "traffic", timestamp, {
        connections: previous?.connections ?? null,
        misses: previous?.misses ?? 0,
        lastActiveAt: previous?.last_active_at ?? null,
      });
    }
  }

  private savePresence(
    connectionId: string,
    engine: EngineId,
    status: PresenceStatus,
    signal: "connections" | "traffic",
    observedAt: string,
    value: { connections: number | null; misses: number; lastActiveAt: string | null },
  ) {
    const previous = this.presence(connectionId, engine);
    const changedAt = previous?.status === status ? previous.changed_at : observedAt;
    this.db.raw.query(`
      INSERT INTO connection_presence (
        connection_id, engine, status, signal, connections, misses, last_active_at, observed_at, changed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(connection_id, engine) DO UPDATE SET
        status = excluded.status, signal = excluded.signal, connections = excluded.connections,
        misses = excluded.misses, last_active_at = excluded.last_active_at,
        observed_at = excluded.observed_at, changed_at = excluded.changed_at
    `).run(connectionId, engine, status, signal, value.connections, value.misses, value.lastActiveAt, observedAt, changedAt);
  }

  private updateActivityFacts(reference: Date) {
    const timestamp = reference.toISOString();
    for (const connection of this.activeConnections()) {
      const rows = Object.values(connection.presence!.engines);
      const online = rows.filter((row) => row.status === "online");
      if (online.length) {
        const seenAt = online.map((row) => row.last_active_at).filter(Boolean).sort().at(-1) ?? timestamp;
        const first = !connection.first_seen_at;
        const returned = Boolean(connection.absence_notified_at);
        this.db.raw.query(`
          UPDATE connections SET first_seen_at = COALESCE(first_seen_at, ?),
            last_seen_at = ?, absence_notified_at = NULL WHERE id = ?
        `).run(seenAt, seenAt, connection.id);
        if (first) this.activity("connection.first_seen", connection.id, connection.name, timestamp);
        else if (returned) this.activity("connection.returned", connection.id, connection.name, timestamp, {
          absentSince: connection.absence_notified_at,
        });
        continue;
      }
      const unknown = connection.presence!.status === "unknown";
      if (
        !unknown && connection.last_seen_at && !connection.absence_notified_at
        && reference.getTime() - new Date(connection.last_seen_at).getTime() >= 24 * 60 * 60 * 1000
      ) {
        this.db.raw.query("UPDATE connections SET absence_notified_at = ? WHERE id = ?").run(timestamp, connection.id);
        this.activity("connection.offline_long", connection.id, connection.name, timestamp, { lastSeenAt: connection.last_seen_at });
      }
    }
  }

  private activity(type: string, id: string, name: string, occurredAt: string, data: Record<string, unknown> = {}) {
    this.journal.record(type, {
      actor: "telemetry",
      subjectType: "connection",
      subjectId: id,
      occurredAt,
      data: { connectionName: name, ...data },
    });
  }

  private telemetryFailure(engine: EngineId, error: unknown, reference: Date) {
    const key = `telemetry:${engine}`;
    const timestamp = reference.toISOString();
    const previous = this.monitor(key);
    const failures = (previous?.failures ?? 0) + 1;
    const unavailable = failures >= 2;
    if (unavailable && previous?.status !== "unavailable") {
      this.journal.record("engine.telemetry_unavailable", {
        actor: "monitor", source: engine, subjectType: "engine", subjectId: engine, occurredAt: timestamp, data: { engine },
      });
    }
    this.saveMonitor(key, unavailable ? "unavailable" : previous?.status ?? "baseline", failures, timestamp, {
      error: safeCollectorError(error),
    });
  }

  private telemetrySuccess(engine: EngineId, reference: Date) {
    const key = `telemetry:${engine}`;
    const timestamp = reference.toISOString();
    const previous = this.monitor(key);
    if (previous?.status === "unavailable") {
      this.journal.record("engine.telemetry_restored", {
        actor: "monitor", source: engine, subjectType: "engine", subjectId: engine, occurredAt: timestamp, data: { engine },
      });
    }
    this.saveMonitor(key, "available", 0, timestamp, {});
  }

  private activeConnections() {
    return this.connections.list().filter((connection) => connection.status === "active" && !connection.suspended_at);
  }

  private presence(connectionId: string, engine: EngineId) {
    return this.db.raw.query<PresenceRow, [string, string]>(
      "SELECT * FROM connection_presence WHERE connection_id = ? AND engine = ?",
    ).get(connectionId, engine) ?? null;
  }

  private monitor(key: string) {
    return this.db.raw.query<MonitorRow, string>("SELECT * FROM monitor_states WHERE key = ?").get(key) ?? null;
  }

  private saveMonitor(key: string, status: string, failures: number, observedAt: string, data: Record<string, unknown>) {
    const previous = this.monitor(key);
    const changedAt = previous?.status === status ? previous.changed_at : observedAt;
    this.db.raw.query(`
      INSERT INTO monitor_states (key, status, failures, data_json, observed_at, changed_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET status = excluded.status, failures = excluded.failures,
        data_json = excluded.data_json, observed_at = excluded.observed_at, changed_at = excluded.changed_at
    `).run(key, status, failures, JSON.stringify(data), observedAt, changedAt);
  }

  private rollup(source: string, target: string, before: string, minutes: number) {
    const rows = this.db.raw.query<{
      bucket_at: string; connection_id: string; engine: string; upload: number; download: number;
    }, [string, string]>(`
      SELECT bucket_at, connection_id, engine, upload, download FROM traffic_samples
      WHERE bucket = ? AND bucket_at < ?
    `).all(source, before);
    const insert = this.db.raw.query(`
      INSERT INTO traffic_samples (bucket, bucket_at, connection_id, engine, upload, download)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket, bucket_at, connection_id, engine) DO UPDATE SET
        upload = upload + excluded.upload, download = download + excluded.download
    `);
    this.db.raw.transaction(() => {
      for (const row of rows) {
        insert.run(target, floorDate(new Date(row.bucket_at), minutes).toISOString(), row.connection_id, row.engine, row.upload, row.download);
      }
    })();
  }
}

export {HysteriaCollector, XrayCollector, configuredCollectors, parseXrayStats} from "../adapters/traffic-collectors";

function floorDate(date: Date, minutes: number) {
  const value = new Date(date);
  value.setUTCSeconds(0, 0);
  value.setUTCMinutes(Math.floor(value.getUTCMinutes() / minutes) * minutes);
  if (minutes >= 60) {
    const hours = minutes / 60;
    value.setUTCHours(Math.floor(value.getUTCHours() / hours) * hours);
    value.setUTCMinutes(0);
  }
  return value;
}

type PresenceRow = {
  connection_id: string;
  engine: EngineId;
  status: PresenceStatus;
  signal: "connections" | "traffic";
  connections: number | null;
  misses: number;
  last_active_at: string | null;
  observed_at: string;
  changed_at: string;
};

type MonitorRow = {
  key: string;
  status: string;
  severity: string | null;
  failures: number;
  data_json: string;
  observed_at: string;
  changed_at: string;
};

function safeCollectorError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export function periodStart(period: TrafficPeriod, timeZone = "UTC", reference = new Date()) {
  const durations: Partial<Record<TrafficPeriod, number>> = { "24h": 1, "7d": 7, "30d": 30, "365d": 365 };
  const days = durations[period];
  if (days) return new Date(reference.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  if (period === "all") return null;

  const local = dateParts(reference, timeZone);
  if (period === "today") return zonedDate({ ...local, hour: 0, minute: 0, second: 0 }, timeZone).toISOString();
  if (period === "month") return zonedDate({ ...local, day: 1, hour: 0, minute: 0, second: 0 }, timeZone).toISOString();
  if (period === "year") return zonedDate({ ...local, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, timeZone).toISOString();

  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  const monday = new Date(Date.UTC(local.year, local.month - 1, local.day - ((weekday + 6) % 7)));
  return zonedDate({
    year: monday.getUTCFullYear(), month: monday.getUTCMonth() + 1, day: monday.getUTCDate(),
    hour: 0, minute: 0, second: 0,
  }, timeZone).toISOString();
}

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function dateParts(date: Date, timeZone: string): DateParts {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return values as DateParts;
}

function zonedDate(parts: DateParts, timeZone: string) {
  const wanted = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let value = wanted;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = dateParts(new Date(value), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    value += wanted - represented;
  }
  return new Date(value);
}
