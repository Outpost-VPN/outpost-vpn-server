import { readdirSync, statSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { uptime } from "node:os";
import { join } from "node:path";
import { networkDefaults, settingsPatchSchema, type NetworkSettings } from "../../shared/settings";
import type { OutpostDatabase } from "../db/database";
import { now } from "../db/database";
import { config } from "../config";
import { engineIds, engines, engineMetadata, serviceNames, type EngineId } from "../../shared/engines";
import { ServiceError } from "./connections";
import { JournalService, type JournalQuery } from "./journal";
import { ApplicationUpdateService } from "./application-updates";


export class SystemService {
  readonly journal: JournalService;
  readonly updates: ApplicationUpdateService;

  constructor(private db: OutpostDatabase, journal?: JournalService, updates?: ApplicationUpdateService) {
    this.journal = journal ?? new JournalService(db);
    this.updates = updates ?? new ApplicationUpdateService(db);
  }

  async state() {
    const monitored = this.db.setting<{
      services?: Array<{ name: string; status: string }>;
      tls?: { status: string; expiresAt: string | null; error?: string | null };
      metrics?: {
        cpu: { percent: number };
        memory: { used: number; total: number; percent: number };
        disk: { used: number; total: number; percent: number };
        network?: {
          download: number;
          upload: number;
          history: Array<{ download: number; upload: number; sampledAt: string }>;
        };
      };
      transports?: { xhttp?: boolean; grpc?: boolean };
      checkedAt?: string;
    }>("monitor_snapshot", {});
    const services = this.db.engines.services(monitored.services);
    const versions = this.db.engines.versions();
    const database = safeSize(config.databasePath);
    const backups = listBackups();
    const address = await resolve();
    const rulesets = this.db.setting("rulesets", { status: "idle", activeVersion: null, checkedAt: null, lastError: null });
    return {
      demo: config.demo,
      version: config.version,
      domain: config.domain,
      address,
      origin: config.origin,
      services,
      transports: [
        { name: "VLESS XHTTP", status: transportStatus(monitored.transports?.xhttp), listen: "127.0.0.1:10000", secret: config.xhttpPath },
        { name: "VLESS gRPC", status: transportStatus(monitored.transports?.grpc), listen: "127.0.0.1:10001", secret: config.grpcService },
      ],
      versions,
      engineReleases: this.db.engines.releaseChecks(),
      engines: engineMetadata,
      telemetryLimited: this.db.engines.limitedTelemetry,
      tls: {
        status: monitored.tls?.status ?? "unknown",
        domain: config.domain,
        expiresAt: monitored.tls?.expiresAt ?? null,
        error: monitored.tls?.error ?? null,
      },
      storage: { database },
      backups,
      rulesets,
      uptime: Math.floor(uptime()),
      metrics: {
        cpu: monitored.metrics?.cpu ?? { percent: 0 },
        memory: monitored.metrics?.memory ?? { used: 0, total: 0, percent: 0 },
        disk: monitored.metrics?.disk ?? { used: 0, total: 0, percent: 0 },
        network: {
          download: monitored.metrics?.network?.download ?? 0,
          upload: monitored.metrics?.network?.upload ?? 0,
          history: monitored.metrics?.network?.history ?? [],
        },
      },
      updates: this.updates.state(),
      events: this.journal.latest(8),
      checkedAt: monitored.checkedAt ?? now(),
    };
  }

  status() {
    const monitored = this.db.setting<{
      services?: Array<{ name: string; status: string }>;
      tls?: { status: string; expiresAt: string | null; error?: string | null };
      transports?: { xhttp?: boolean; grpc?: boolean };
      checkedAt?: string;
    }>("monitor_snapshot", {});
    const services = this.db.engines.services(monitored.services);
    const rulesets = this.db.setting<{ status: string; activeVersion: string | null; checkedAt: string | null; lastError: string | null }>(
      "rulesets",
      { status: "idle", activeVersion: null, checkedAt: null, lastError: null },
    );
    const transports = [
      { name: "VLESS XHTTP", status: transportStatus(monitored.transports?.xhttp) },
      { name: "VLESS gRPC", status: transportStatus(monitored.transports?.grpc) },
    ];
    return {
      version: config.version,
      healthy: services.every((service) => ["active", "not-installed"].includes(service.status))
        && transports.every((transport) => transport.status !== "inactive")
        && monitored.tls?.status === "valid",
      services,
      transports,
      tls: {
        status: monitored.tls?.status ?? "unknown",
        expiresAt: monitored.tls?.expiresAt ?? null,
        error: monitored.tls?.error ?? null,
      },
      rulesets: {
        status: rulesets.status,
        activeVersion: rulesets.activeVersion,
        checkedAt: rulesets.checkedAt,
        lastError: rulesets.lastError,
      },
      checkedAt: monitored.checkedAt ?? null,
    };
  }

  settings() {
    const interfaceSettings = this.db.setting<{ compact?: boolean }>("interface", {});
    const systemSettings = this.db.setting<{ timezone?: string; updateChannel?: string }>("system", {});
    const channel = systemSettings.updateChannel === "candidate" ? "candidate" : "stable";
    return {
      interface: {
        compact: interfaceSettings.compact ?? false,
      },
      system: { timezone: systemSettings.timezone ?? "UTC", updateChannel: channel },
      network: this.networkSettings(),
    };
  }

  networkSettings(): NetworkSettings {
    return this.db.setting("network", networkDefaults);
  }

  updateSettings(value: unknown, actor = "owner") {
    const before = this.settings();
    const { interface: nextInterface, system: nextSystem, network: nextNetwork } = settingsPatchSchema.parse(value);
    this.db.raw.transaction(() => {
      if (nextInterface) this.db.setSetting("interface", { ...before.interface, ...nextInterface });
      if (nextSystem) this.db.setSetting("system", { ...before.system, ...nextSystem });
      if (nextNetwork) this.db.setSetting("network", {
        ...before.network,
        ...nextNetwork,
        mihomo: { ...before.network.mihomo, ...nextNetwork.mihomo },
      });
    })();
    if (nextSystem?.updateChannel !== undefined && nextSystem.updateChannel !== before.system.updateChannel) this.updates.reset();
    const after = this.settings();
    this.db.audit({ actor, action: "settings.update", resource: "settings", before, after });
    return after;
  }

  events(query: JournalQuery = {}) {
    return this.journal.list(query);
  }
}

function transportStatus(value?: boolean) {
  return value === true ? "active" : value === false ? "inactive" : "unknown";
}

async function resolve() {
  if (config.demo) return "203.0.113.42";
  try {
    return (await lookup(config.domain, { family: 4 })).address;
  } catch {
    return null;
  }
}

function listBackups() {
  const directory = join(config.dataDir, "backups");
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^outpost-[0-9a-f-]+\.(age|tar)$/.test(entry.name))
      .map((entry) => {
        const file = statSync(join(directory, entry.name));
        return { name: entry.name, size: file.size, created_at: file.mtime.toISOString() };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function safeSize(path: string) {
  try { return statSync(path).size; } catch { return 0; }
}
