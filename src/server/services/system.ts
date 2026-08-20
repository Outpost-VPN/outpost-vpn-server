import { readdirSync, statSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { uptime } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { OutpostDatabase } from "../db/database";
import { now } from "../db/database";
import { config } from "../config";
import type { EngineId } from "../models";
import { ServiceError } from "./connections";
import { JournalService, type JournalQuery } from "./journal";

const engineIds: EngineId[] = ["hysteria", "xray"];
const interfaceSettingsInput = z.object({
  language: z.string().trim().min(2).max(12).optional(),
  compact: z.boolean().optional(),
}).strict();

export class SystemService {
  readonly journal: JournalService;

  constructor(private db: OutpostDatabase, journal?: JournalService) {
    this.journal = journal ?? new JournalService(db);
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
    const services = monitored.services ?? ["outpost", "nginx", "hysteria-server", "xray"].map((name) => ({ name, status: "unknown" }));
    const versions = this.db.raw.query<{ engine: string; installed_version: string | null; desired_version: string; checksum: string }, []>(
      "SELECT engine, installed_version, desired_version, checksum FROM engine_versions ORDER BY engine",
    ).all();
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
      engineOrder: this.engineOrder(),
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
      tls?: { status: string; expiresAt: string | null; error?: string | null };
      transports?: { xhttp?: boolean; grpc?: boolean };
      checkedAt?: string;
    }>("monitor_snapshot", {});
    const services = monitored.services ?? ["outpost", "nginx", "hysteria-server", "xray"]
      .map((name) => ({ name, status: "unknown" }));
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
      healthy: services.every((service) => service.status === "active")
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
    const interfaceSettings = this.db.setting<{ language?: string; compact?: boolean }>("interface", {});
    const systemSettings = this.db.setting<{ timezone?: string; updateChannel?: string }>("system", {});
    return {
      interface: {
        language: interfaceSettings.language ?? "ru",
        compact: interfaceSettings.compact ?? false,
      },
      system: { timezone: "UTC", updateChannel: "stable", ...systemSettings },
    };
  }

  updateSettings(value: { interface?: unknown; system?: unknown }, actor = "owner") {
    const before = this.settings();
    if (value.interface !== undefined) {
      const next = interfaceSettingsInput.parse(value.interface);
      this.db.setSetting("interface", { ...before.interface, ...next });
    }
    if (value.system !== undefined) this.db.setSetting("system", value.system);
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
