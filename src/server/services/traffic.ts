import type { OutpostDatabase } from "../db/database";
import type { EngineId, PresenceStatus, TrafficPoint } from "../models";
import { JournalService } from "./journal";

export interface TelemetrySnapshot {
  traffic: TrafficPoint[];
  online?: Record<string, number>;
}

export interface TrafficCollector {
  id: EngineId;
  collect(): Promise<TelemetrySnapshot>;
}

export type TrafficPeriod = "today" | "24h" | "week" | "7d" | "month" | "30d" | "year" | "365d" | "all";

export class TrafficService {
  private journal: JournalService;

  constructor(private db: OutpostDatabase, private collectors: TrafficCollector[] = [], journal?: JournalService) {
    this.journal = journal ?? new JournalService(db);
  }

  async collect(reference = new Date()) {
    for (const collector of this.collectors) {
      try {
        const snapshot = await collector.collect();
        const active = new Set<string>();
        for (const point of snapshot.traffic) {
          const delta = this.recordCumulative(collector.id, point, reference);
          if (delta.activity) active.add(point.connectionId);
        }
        if (collector.id === "hysteria") this.updateHysteriaPresence(snapshot.online ?? {}, reference);
        else this.updateXrayPresence(active, reference);
        this.telemetrySuccess(collector.id, reference);
      } catch (error) {
        this.markUnknown(collector.id, reference);
        this.telemetryFailure(collector.id, error, reference);
      }
    }
    this.updateActivityFacts(reference);
    this.compact(reference);
  }

  recordCumulative(engine: string, point: TrafficPoint, observedAt = new Date()) {
    const connection = this.db.raw.query<{ id: string }, string>("SELECT id FROM connections WHERE id = ?").get(point.connectionId);
    if (!connection) return { upload: 0, download: 0, activity: false, reset: false };
    const cursor = this.db.raw.query<{ upload: number; download: number }, [string, string]>(`
      SELECT upload, download FROM traffic_cursors WHERE connection_id = ? AND engine = ?
    `).get(point.connectionId, engine);
    const reset = Boolean(cursor && (point.upload < cursor.upload || point.download < cursor.download));
    const upload = cursor && point.upload >= cursor.upload ? point.upload - cursor.upload : point.upload;
    const download = cursor && point.download >= cursor.download ? point.download - cursor.download : point.download;
    const bucketAt = floorDate(observedAt, 5).toISOString();
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        INSERT INTO traffic_cursors (connection_id, engine, upload, download, observed_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(connection_id, engine) DO UPDATE SET
          upload = excluded.upload, download = excluded.download, observed_at = excluded.observed_at
      `).run(point.connectionId, engine, point.upload, point.download, observedAt.toISOString());
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

  overview(period: TrafficPeriod = "30d", timeZone = "UTC") {
    const reference = new Date();
    const since = periodStart(period, timeZone, reference);
    const filter = since ? "WHERE traffic_samples.bucket_at >= ?" : "";
    const params = since ? [since] as [string] : [] as [];
    const totals = this.db.raw.query<{ upload: number; download: number }, [string] | []>(`
      SELECT COALESCE(SUM(upload), 0) AS upload, COALESCE(SUM(download), 0) AS download
      FROM traffic_samples ${filter}
    `).get(...params) ?? { upload: 0, download: 0 };
    const connectionRows = this.db.raw.query<{
      connection_id: string; name: string; upload: number; download: number;
    }, [string] | []>(`
      SELECT connections.id AS connection_id, connections.name,
        COALESCE(SUM(traffic_samples.upload), 0) AS upload,
        COALESCE(SUM(traffic_samples.download), 0) AS download
      FROM connections LEFT JOIN traffic_samples ON traffic_samples.connection_id = connections.id
        ${since ? "AND traffic_samples.bucket_at >= ?" : ""}
      WHERE connections.archived_at IS NULL
      GROUP BY connections.id ORDER BY upload + download DESC
    `).all(...params);
    const connectionSeries = this.db.raw.query<{
      connection_id: string; bucket_at: string; upload: number; download: number;
    }, [string] | []>(`
      SELECT connection_id, bucket_at, SUM(upload) AS upload, SUM(download) AS download
      FROM traffic_samples ${filter}
      GROUP BY connection_id, bucket_at ORDER BY bucket_at
    `).all(...params);
    const connections = connectionRows.map((connection) => ({
      ...connection,
      series: connectionSeries.filter((point) => point.connection_id === connection.connection_id)
        .map(({ connection_id: _connectionId, ...point }) => point),
    }));
    const series = this.db.raw.query<{ bucket_at: string; upload: number; download: number }, [string] | []>(`
      SELECT bucket_at, SUM(upload) AS upload, SUM(download) AS download
      FROM traffic_samples ${filter}
      GROUP BY bucket_at ORDER BY bucket_at
    `).all(...params);
    return { period, from: since, to: reference.toISOString(), totals, connections, series };
  }

  compact(reference = new Date()) {
    const fiveMinuteCutoff = new Date(reference.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const hourlyCutoff = new Date(reference.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    this.rollup("5m", "1h", fiveMinuteCutoff, 60);
    this.rollup("1h", "1d", hourlyCutoff, 24 * 60);
    this.db.raw.query("DELETE FROM traffic_samples WHERE bucket = '5m' AND bucket_at < ?").run(fiveMinuteCutoff);
    this.db.raw.query("DELETE FROM traffic_samples WHERE bucket = '1h' AND bucket_at < ?").run(hourlyCutoff);
  }

  seedDemo() {
    const connections = this.activeConnections();
    if (!connections.length) return;
    const existing = this.db.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM traffic_samples").get()?.count ?? 0;
    if (existing) return;
    const cumulative = new Map<string, { upload: number; download: number }>();
    for (let i = 288; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 5 * 60 * 1000);
      for (const connection of connections) {
        const value = cumulative.get(connection.id) ?? { upload: 0, download: 0 };
        value.upload += Math.floor((1 + Math.sin(i / 17)) * 90_000);
        value.download += Math.floor((1 + Math.cos(i / 13)) * 540_000);
        cumulative.set(connection.id, value);
        this.recordCumulative(i % 2 ? "hysteria" : "xray", { connectionId: connection.id, ...value }, date);
      }
    }
  }

  private updateHysteriaPresence(online: Record<string, number>, reference: Date) {
    const timestamp = reference.toISOString();
    for (const connection of this.activeConnections()) {
      const connections = Math.max(0, Math.trunc(Number(online[connection.id] ?? 0)));
      const previous = this.presence(connection.id, "hysteria");
      if (connections > 0) {
        this.savePresence(connection.id, "hysteria", "online", "connections", timestamp, {
          connections, misses: 0, lastActiveAt: timestamp,
        });
        continue;
      }
      const misses = (previous?.misses ?? 0) + 1;
      const status: PresenceStatus = misses >= 2 ? "offline" : previous?.status ?? "unknown";
      this.savePresence(connection.id, "hysteria", status, "connections", timestamp, {
        connections: 0, misses, lastActiveAt: previous?.last_active_at ?? null,
      });
    }
  }

  private updateXrayPresence(active: Set<string>, reference: Date) {
    const timestamp = reference.toISOString();
    for (const connection of this.activeConnections()) {
      const previous = this.presence(connection.id, "xray");
      const lastActiveAt = active.has(connection.id) ? timestamp : previous?.last_active_at ?? null;
      const recent = lastActiveAt !== null && reference.getTime() - new Date(lastActiveAt).getTime() <= 2 * 60 * 1000;
      this.savePresence(connection.id, "xray", recent ? "online" : "offline", "traffic", timestamp, {
        connections: null, misses: 0, lastActiveAt,
      });
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
      const rows = this.db.raw.query<{ status: PresenceStatus; last_active_at: string | null }, string>(`
        SELECT status, last_active_at FROM connection_presence WHERE connection_id = ?
      `).all(connection.id);
      if (!rows.length) continue;
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
      const unknown = rows.some((row) => row.status === "unknown");
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
    return this.db.raw.query<{
      id: string;
      name: string;
      first_seen_at: string | null;
      last_seen_at: string | null;
      absence_notified_at: string | null;
    }, []>(`
      SELECT id, name, first_seen_at, last_seen_at, absence_notified_at
      FROM connections WHERE status = 'active' AND archived_at IS NULL
    `).all();
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

export class HysteriaCollector implements TrafficCollector {
  id = "hysteria" as const;
  constructor(private url: string, private secret?: string) {}

  async collect() {
    const headers = this.secret ? { authorization: this.secret } : undefined;
    const base = this.url.replace(/\/$/, "");
    const [trafficResponse, onlineResponse] = await Promise.all([
      fetch(`${base}/traffic`, { headers }),
      fetch(`${base}/online`, { headers }),
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
  constructor(private binary: string, private server = "127.0.0.1:10085") {}

  async collect() {
    const process = Bun.spawn([this.binary, "api", "statsquery", `--server=${this.server}`, "-pattern", "user>>>"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
    ]);
    if (code !== 0) throw new Error(`Xray stats: ${stderr.trim()}`);
    const counters = parseXrayStats(stdout);
    const points = new Map<string, TrafficPoint>();
    for (const [name, value] of counters) {
      const match = name.match(/^user>>>([^>]+)>>>traffic>>>(uplink|downlink)$/);
      if (!match) continue;
      const email = match[1]!;
      const local = email.endsWith("@outpost.local") ? email.slice(0, -"@outpost.local".length) : email;
      const connectionId = local.replace(/\.\d+$/, "");
      const point = points.get(connectionId) ?? { connectionId, upload: 0, download: 0 };
      if (match[2] === "uplink") point.upload = value;
      else point.download = value;
      points.set(connectionId, point);
    }
    return { traffic: Array.from(points.values()) };
  }
}

export function configuredCollectors(): TrafficCollector[] {
  const collectors: TrafficCollector[] = [];
  if (process.env.OUTPOST_HYSTERIA_STATS_URL) {
    collectors.push(new HysteriaCollector(process.env.OUTPOST_HYSTERIA_STATS_URL, process.env.OUTPOST_HYSTERIA_STATS_SECRET));
  }
  if (process.env.OUTPOST_XRAY_BINARY) {
    collectors.push(new XrayCollector(process.env.OUTPOST_XRAY_BINARY, process.env.OUTPOST_XRAY_API));
  }
  return collectors;
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
