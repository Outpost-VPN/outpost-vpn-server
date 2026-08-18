import { readdirSync, statSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { uptime } from "node:os";
import { join } from "node:path";
import type { MatreshkaDatabase } from "../db/database";
import { now } from "../db/database";
import { config } from "../config";
import type { EngineId } from "../models";
import { ServiceError } from "./people";
import { JournalService, type JournalQuery } from "./journal";

const engineIds: EngineId[] = ["hysteria", "xray"];

export class SystemService {
  readonly journal: JournalService;

  constructor(private db: MatreshkaDatabase, journal?: JournalService) {
    this.journal = journal ?? new JournalService(db);
  }

  async state() {
    const monitored = this.db.setting<{
      services?: Array<{ name: string; status: string }>;
      tls?: { status: string; expiresAt: string | null };
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
      checkedAt?: string;
    }>("monitor_snapshot", {});
    const services = monitored.services ?? ["matreshka", "nginx", "hysteria-server", "xray"].map((name) => ({ name, status: "unknown" }));
    const versions = this.db.raw.query<{ engine: string; installed_version: string | null; desired_version: string; checksum: string }, []>(
      "SELECT engine, installed_version, desired_version, checksum FROM engine_versions ORDER BY engine",
    ).all();
    const database = safeSize(config.databasePath);
    const backups = listBackups();
    const address = await resolve();
    return {
      demo: config.demo,
      version: config.version,
      domain: config.domain,
      address,
      origin: config.origin,
      services,
      versions,
      engineOrder: this.engineOrder(),
      tls: {
        status: monitored.tls?.status ?? "unknown",
        domain: config.domain,
        expiresAt: monitored.tls?.expiresAt ?? null,
      },
      storage: { database },
      backups,
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
      updates: config.demo
        ? { available: true, current: config.version, latest: "0.1.1" }
        : { available: false, current: config.version, latest: config.version },
      events: this.journal.latest(8),
      checkedAt: monitored.checkedAt ?? now(),
    };
  }

  status() {
    const monitored = this.db.setting<{
      services?: Array<{ name: string; status: string }>;
      tls?: { status: string; expiresAt: string | null };
      checkedAt?: string;
    }>("monitor_snapshot", {});
    const services = monitored.services ?? ["matreshka", "nginx", "hysteria-server", "xray"]
      .map((name) => ({ name, status: "unknown" }));
    return {
      version: config.version,
      healthy: services.every((service) => service.status === "active") && monitored.tls?.status === "valid",
      services,
      tls: {
        status: monitored.tls?.status ?? "unknown",
        expiresAt: monitored.tls?.expiresAt ?? null,
      },
      checkedAt: monitored.checkedAt ?? null,
    };
  }

  engineOrder(): EngineId[] {
    const stored = this.db.setting<unknown>("engine_order", engineIds);
    if (!Array.isArray(stored)) return [...engineIds];
    const valid = stored.filter((item): item is EngineId => typeof item === "string" && engineIds.includes(item as EngineId));
    return [...new Set(valid), ...engineIds.filter((item) => !valid.includes(item))];
  }

  updateEngineOrder(ids: unknown, actor = "owner") {
    if (!Array.isArray(ids) || ids.length !== engineIds.length || ids.some((item) => typeof item !== "string")) {
      throw new ServiceError(400, "Укажите все доступные движки в нужном порядке");
    }
    const next = ids as EngineId[];
    if (new Set(next).size !== engineIds.length || engineIds.some((item) => !next.includes(item))) {
      throw new ServiceError(400, "Порядок движков содержит неизвестные или повторяющиеся элементы");
    }
    const before = this.engineOrder();
    return this.journal.change(
      "engine.order_changed",
      () => {
        this.db.setSetting("engine_order", next);
        return { engineOrder: next };
      },
      () => ({ actor, action: "engines.reorder", resource: "engines", before, after: next }),
      () => ({ actor, source: "engines", subjectType: "engine_order", data: { order: next } }),
    );
  }

  settings() {
    const interfaceSettings = this.db.setting<{ language?: string; compact?: boolean; ownerAvatar?: string }>("interface", {});
    const systemSettings = this.db.setting<{ timezone?: string; updateChannel?: string }>("system", {});
    return {
      interface: { language: "ru", compact: false, ownerAvatar: "avatar-current", ...interfaceSettings },
      system: { timezone: "Europe/Moscow", updateChannel: "stable", ...systemSettings },
    };
  }

  updateSettings(value: { interface?: unknown; system?: unknown }, actor = "owner") {
    const before = this.settings();
    if (value.interface !== undefined) this.db.setSetting("interface", value.interface);
    if (value.system !== undefined) this.db.setSetting("system", value.system);
    const after = this.settings();
    this.db.audit({ actor, action: "settings.update", resource: "settings", before, after });
    return after;
  }

  events(query: JournalQuery = {}) {
    return this.journal.list(query);
  }
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
      .filter((entry) => entry.isFile() && /^matreshka-[0-9a-f-]+\.(age|tar)$/.test(entry.name))
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
