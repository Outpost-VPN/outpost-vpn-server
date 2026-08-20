import { readFileSync, statfsSync } from "node:fs";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import { connect as tcpConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { config } from "../config";
import type { OutpostDatabase } from "../db/database";
import type { JournalSeverity } from "../models";
import { JournalService } from "./journal";

const monitoredServices = ["outpost", "nginx", "hysteria-server", "xray"] as const;

export type MonitoringSnapshot = {
  services: Record<string, boolean>;
  diskPercent: number;
  disk?: { used: number; total: number };
  tlsDays: number | null;
  tlsExpiresAt?: string | null;
  tlsError?: string | null;
  transports?: { xhttp: boolean; grpc: boolean };
  metrics?: {
    cpu: { percent: number };
    memory: { used: number; total: number; percent: number };
    network?: { received: number; transmitted: number };
  };
};

type NetworkMetric = {
  download: number;
  upload: number;
  received: number;
  transmitted: number;
  sampledAt: string;
  history: Array<{ download: number; upload: number; sampledAt: string }>;
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

type ServiceStates = Record<string, boolean>;

export class MonitoringService {
  private journal: JournalService;

  constructor(
    private db: OutpostDatabase,
    journal?: JournalService,
    private probe: () => Promise<MonitoringSnapshot> = defaultProbe,
    private serviceProbe: () => Promise<ServiceStates> = defaultServiceProbe,
  ) {
    this.journal = journal ?? new JournalService(db);
  }

  async collect(reference = new Date()) {
    const snapshot = await this.probe();
    const previous = this.db.setting<{ metrics?: { network?: NetworkMetric }; transports?: { xhttp: boolean; grpc: boolean } }>("monitor_snapshot", {});
    const overrides = config.demo ? this.db.setting<Record<string, boolean>>("demo_service_states", {}) : {};
    const services = { ...snapshot.services, ...overrides };
    const observedAt = reference.toISOString();
    for (const service of monitoredServices) this.observeService(service, services[service] ?? false, observedAt);
    if (snapshot.transports) {
      this.observeService("vless-xhttp", snapshot.transports.xhttp, observedAt);
      this.observeService("vless-grpc", snapshot.transports.grpc, observedAt);
    }
    this.observeThreshold(
      "system:disk",
      snapshot.diskPercent >= 95 ? "critical" : snapshot.diskPercent >= 85 ? "warning" : snapshot.diskPercent < 80 ? "healthy" : "hold",
      observedAt,
      { percent: snapshot.diskPercent },
      { warning: "system.disk_warning", critical: "system.disk_critical", recovered: "system.disk_restored" },
    );
    if (snapshot.tlsDays !== null) {
      this.observeThreshold(
        "system:tls",
        snapshot.tlsDays < 7 ? "critical" : snapshot.tlsDays < 30 ? "warning" : "healthy",
        observedAt,
        { days: snapshot.tlsDays },
        { warning: "system.tls_warning", critical: "system.tls_critical", recovered: "system.tls_restored" },
      );
    }
    const memoryTotal = snapshot.metrics?.memory.total ?? 0;
    const memoryUsed = snapshot.metrics?.memory.used ?? 0;
    this.db.setSetting("monitor_snapshot", {
      services: monitoredServices.map((name) => ({ name, status: services[name] ? "active" : "inactive" })),
      transports: snapshot.transports ?? previous.transports,
      tls: {
        status: snapshot.tlsDays === null ? "unknown" : snapshot.tlsDays < 7 ? "critical" : snapshot.tlsDays < 30 ? "warning" : "valid",
        expiresAt: snapshot.tlsExpiresAt ?? (snapshot.tlsDays === null ? null : new Date(reference.getTime() + snapshot.tlsDays * 24 * 60 * 60 * 1000).toISOString()),
        error: snapshot.tlsDays === null ? snapshot.tlsError ?? "Не удалось проверить TLS-сертификат" : null,
      },
      metrics: {
        cpu: snapshot.metrics?.cpu ?? { percent: 0 },
        memory: snapshot.metrics?.memory ?? { used: memoryUsed, total: memoryTotal, percent: percent(memoryUsed, memoryTotal) },
        disk: { used: snapshot.disk?.used ?? 0, total: snapshot.disk?.total ?? 0, percent: snapshot.diskPercent },
        network: networkMetric(snapshot.metrics?.network, previous.metrics?.network, reference),
      },
      checkedAt: observedAt,
    });
  }

  async refreshServices(reference = new Date()) {
    const probed = await this.serviceProbe();
    const overrides = config.demo ? this.db.setting<Record<string, boolean>>("demo_service_states", {}) : {};
    const services = { ...probed, ...overrides };
    const observedAt = reference.toISOString();
    for (const service of monitoredServices) this.observeService(service, services[service] ?? false, observedAt);
    const snapshot = this.db.setting<Record<string, unknown>>("monitor_snapshot", {});
    this.db.setSetting("monitor_snapshot", {
      ...snapshot,
      services: monitoredServices.map((name) => ({ name, status: services[name] ? "active" : "inactive" })),
      checkedAt: observedAt,
    });
  }

  private observeService(service: string, healthy: boolean, observedAt: string) {
    const key = `service:${service}`;
    const previous = this.state(key);
    if (healthy) {
      if (previous?.status === "unavailable") {
        this.journal.record("service.restored", {
          actor: "monitor",
          source: service,
          subjectType: "service",
          subjectId: service,
          occurredAt: observedAt,
          data: { service },
        });
      }
      this.save(key, "available", null, 0, observedAt, {});
      return;
    }

    const failures = (previous?.failures ?? 0) + 1;
    if (failures >= 2 && previous?.status !== "unavailable") {
      this.journal.record("service.unavailable", {
        actor: "monitor",
        source: service,
        subjectType: "service",
        subjectId: service,
        occurredAt: observedAt,
        data: { service },
      });
    }
    this.save(key, failures >= 2 ? "unavailable" : previous?.status ?? "baseline", "error", failures, observedAt, {});
  }

  private observeThreshold(
    key: string,
    level: "healthy" | "hold" | "warning" | "critical",
    observedAt: string,
    data: Record<string, unknown>,
    events: { warning: string; critical: string; recovered: string },
  ) {
    const previous = this.state(key);
    if (level === "hold") {
      this.save(key, previous?.status ?? "healthy", previous?.severity as JournalSeverity | null, previous?.failures ?? 0, observedAt, data);
      return;
    }
    if (level === "healthy") {
      if (previous?.status === "warning" || previous?.status === "critical") {
        this.journal.record(events.recovered, { actor: "monitor", occurredAt: observedAt, data });
      }
      this.save(key, "healthy", null, 0, observedAt, data);
      return;
    }

    const previousData = parseData(previous?.data_json);
    const failures = previousData.target === level ? (previous?.failures ?? 0) + 1 : 1;
    if (failures >= 2 && previous?.status !== level) {
      this.journal.record(events[level], { actor: "monitor", severity: level, occurredAt: observedAt, data });
    }
    const status = failures >= 2 ? level : previous?.status ?? "baseline";
    this.save(key, status, level, failures, observedAt, { ...data, target: level });
  }

  private state(key: string) {
    return this.db.raw.query<MonitorRow, string>("SELECT * FROM monitor_states WHERE key = ?").get(key) ?? null;
  }

  private save(
    key: string,
    status: string,
    severity: JournalSeverity | null,
    failures: number,
    observedAt: string,
    data: Record<string, unknown>,
  ) {
    const previous = this.state(key);
    const changedAt = previous?.status === status ? previous.changed_at : observedAt;
    this.db.raw.query(`
      INSERT INTO monitor_states (key, status, severity, failures, data_json, observed_at, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        status = excluded.status,
        severity = excluded.severity,
        failures = excluded.failures,
        data_json = excluded.data_json,
        observed_at = excluded.observed_at,
        changed_at = excluded.changed_at
    `).run(key, status, severity, failures, JSON.stringify(data), observedAt, changedAt);
  }
}

async function defaultProbe(): Promise<MonitoringSnapshot> {
  if (config.demo) {
    return {
      services: Object.fromEntries(monitoredServices.map((service) => [service, true])),
      diskPercent: 42,
      disk: { used: 10_737_418_240, total: 25_769_803_776 },
      tlsDays: 90,
      transports: { xhttp: true, grpc: true },
      metrics: {
        cpu: { percent: 18 },
        memory: { used: 1_610_612_736, total: 4_294_967_296, percent: 38 },
        network: { received: 0, transmitted: 0 },
      },
    };
  }
  const [services, tls, xhttp, grpc] = await Promise.all([
    defaultServiceProbe(), certificate(), tcpPort(10000), tcpPort(10001),
  ]);
  const disk = diskUsage(config.dataDir);
  return {
    services,
    diskPercent: disk.percent,
    disk,
    tlsDays: tls.days,
    tlsExpiresAt: tls.expiresAt,
    tlsError: tls.error,
    transports: { xhttp, grpc },
    metrics: resourceMetrics(),
  };
}

async function defaultServiceProbe(): Promise<ServiceStates> {
  if (config.demo) return Object.fromEntries(monitoredServices.map((service) => [service, true]));
  return Object.fromEntries(await Promise.all(
    monitoredServices.map(async (service) => [service, await systemdActive(service)] as const),
  ));
}

async function systemdActive(service: string) {
  try {
    const process = Bun.spawn(["systemctl", "is-active", service], { stdout: "pipe", stderr: "ignore" });
    const [output, code] = await Promise.all([new Response(process.stdout).text(), process.exited]);
    return code === 0 && output.trim() === "active";
  } catch {
    return false;
  }
}

function diskUsage(path: string) {
  try {
    const value = statfsSync(path);
    const total = Number(value.blocks) * Number(value.bsize);
    const free = Number(value.bavail) * Number(value.bsize);
    const used = Math.max(0, total - free);
    return { used, total, percent: percent(used, total) };
  } catch {
    return { used: 0, total: 0, percent: 0 };
  }
}

function resourceMetrics() {
  const memoryTotal = totalmem();
  const memoryUsed = Math.max(0, memoryTotal - freemem());
  const cpuPercent = Math.max(0, Math.min(100, Math.round(loadavg()[0]! / Math.max(1, cpus().length) * 100)));
  return {
    cpu: { percent: cpuPercent },
    memory: { used: memoryUsed, total: memoryTotal, percent: percent(memoryUsed, memoryTotal) },
    network: networkUsage(),
  };
}

function networkMetric(current: { received: number; transmitted: number } | undefined, previous: NetworkMetric | undefined, reference: Date): NetworkMetric {
  const sampledAt = reference.toISOString();
  if (config.demo) {
    const values = [0.74, 0.9, 0.82, 1.08, 0.93, 1.16, 1.02, 1.2, 1.06, 1.28, 1.12, 1.34, 1.18, 1.25, 1.08, 1.3, 1.14, 1.38, 1.22, 1.31];
    const history = values.map((value, index) => ({
      download: Math.round(525_000 * value),
      upload: Math.round(85_000 * (1.7 - value / 2)),
      sampledAt: new Date(reference.getTime() - (values.length - 1 - index) * 60_000).toISOString(),
    }));
    return { download: 525_000, upload: 85_000, received: 0, transmitted: 0, sampledAt, history };
  }

  const received = current?.received ?? 0;
  const transmitted = current?.transmitted ?? 0;
  const elapsed = previous ? Math.max(1, (reference.getTime() - Date.parse(previous.sampledAt)) / 1000) : 0;
  const download = elapsed ? Math.max(0, Math.round((received - previous!.received) / elapsed)) : 0;
  const upload = elapsed ? Math.max(0, Math.round((transmitted - previous!.transmitted) / elapsed)) : 0;
  const history = [...(previous?.history ?? []), { download, upload, sampledAt }].slice(-20);
  return { download, upload, received, transmitted, sampledAt, history };
}

function networkUsage() {
  try {
    let received = 0;
    let transmitted = 0;
    for (const line of readFileSync("/proc/net/dev", "utf8").split("\n").slice(2)) {
      const [rawName, rawValues] = line.split(":");
      const name = rawName?.trim();
      if (!name || name === "lo" || !rawValues) continue;
      const values = rawValues.trim().split(/\s+/).map(Number);
      received += values[0] ?? 0;
      transmitted += values[8] ?? 0;
    }
    return { received, transmitted };
  } catch {
    return { received: 0, transmitted: 0 };
  }
}

function percent(value: number, total: number) {
  return total ? Math.max(0, Math.min(100, Math.round(value / total * 100))) : 0;
}

async function certificate() {
  return new Promise<{ days: number | null; expiresAt: string | null; error: string | null }>((resolve) => {
    let settled = false;
    const socket = tlsConnect({
      host: config.domain,
      port: 443,
      servername: config.domain,
      rejectUnauthorized: true,
      timeout: 5_000,
    });
    const finish = (result: { days: number | null; expiresAt: string | null; error: string | null }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.once("secureConnect", () => {
      const expiresAt = Date.parse(socket.getPeerCertificate().valid_to);
      if (!Number.isFinite(expiresAt)) {
        finish({ days: null, expiresAt: null, error: "Сервер не отдал срок TLS-сертификата" });
        return;
      }
      finish({
        days: Math.floor((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)),
        expiresAt: new Date(expiresAt).toISOString(),
        error: null,
      });
    });
    socket.once("timeout", () => finish({ days: null, expiresAt: null, error: "HTTPS-проверка превысила время ожидания" }));
    socket.once("error", (error: NodeJS.ErrnoException) => finish({ days: null, expiresAt: null, error: certificateError(error) }));
  });
}

async function tcpPort(port: number) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const socket = tcpConnect({ host: "127.0.0.1", port });
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function certificateError(error: NodeJS.ErrnoException) {
  if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") return "DNS домена не отвечает";
  if (error.code === "ECONNREFUSED") return "HTTPS на порту 443 не отвечает";
  if (error.code === "ETIMEDOUT") return "HTTPS-проверка превысила время ожидания";
  if (error.code === "CERT_HAS_EXPIRED") return "TLS-сертификат истёк";
  if (error.code === "ERR_TLS_CERT_ALTNAME_INVALID") return "TLS-сертификат выпущен для другого домена";
  if (error.code === "DEPTH_ZERO_SELF_SIGNED_CERT" || error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return "TLS-сертификат не доверен";
  }
  return "Не удалось проверить TLS-сертификат";
}

function parseData(value?: string) {
  if (!value) return {} as Record<string, unknown>;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}
