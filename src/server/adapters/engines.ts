import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { OutpostDatabase } from "../db/database";
import type { ConnectionCredential, TrafficPoint } from "../models";
import { config } from "../config";
import { now } from "../db/database";
import { callAgent } from "../services/operations";
import { ServiceError } from "../services/connections";
import { JournalService } from "../services/journal";
import {
  currentEnginePresetVersions,
  defaultHysteriaTemplate,
  defaultXrayTemplate,
  mergeEnginePreset,
  parseEngineTemplate,
  type EngineName,
} from "./engine-presets";

export { defaultHysteriaTemplate, defaultXrayTemplate } from "./engine-presets";

export interface EngineContext {
  credentials: ConnectionCredential[];
  domain: string;
  xhttpPath: string;
  grpcService: string;
}

export interface EngineAdapter {
  readonly id: "hysteria" | "xray";
  install(version: string): Promise<void>;
  upgrade(version: string): Promise<void>;
  render(template: string, context: EngineContext): string;
  validate(rendered: string): Promise<{ valid: boolean; errors: string[] }>;
  apply(rendered: string): Promise<void>;
  rollback(): Promise<void>;
  health(): Promise<{ healthy: boolean; detail: string }>;
  version(): Promise<string | null>;
  events(): Promise<unknown[]>;
  issueCredential(connectionId: string): Promise<void>;
  revokeCredential(connectionId: string): Promise<void>;
  collectTraffic(): Promise<TrafficPoint[]>;
  renderEndpoint(credential: ConnectionCredential): string;
}

const protectedBlocks = {
  hysteria: ["{{OUTPOST_AUTH_URL}}", "{{OUTPOST_STATS_LISTEN}}", "{{OUTPOST_STATS_SECRET}}", "{{OUTPOST_TLS_CERT}}", "{{OUTPOST_TLS_KEY}}"],
  xray: [
    "{{OUTPOST_XHTTP_USERS}}", "{{OUTPOST_GRPC_USERS}}", "{{OUTPOST_API}}",
    "{{OUTPOST_STATS}}", "{{OUTPOST_XHTTP_PATH}}", "{{OUTPOST_GRPC_SERVICE}}",
  ],
} as const;

export function validateTemplate(engine: keyof typeof protectedBlocks, template: string) {
  const errors = protectedBlocks[engine]
    .filter((block) => count(template, block) !== 1)
    .map((block) => `Защищённый блок ${block} должен встречаться ровно один раз`);
  try {
    const parsed = parseEngineTemplate(engine, template);
    if (engine === "hysteria") {
      const rules = nestedArray(parsed, "acl", "inline");
      if (!rules.includes("reject(all, udp/443)")) {
        errors.push("Системное правило reject(all, udp/443) нельзя удалить");
      }
    } else {
      const outbounds = nestedArray(parsed, "outbounds");
      const rules = nestedArray(parsed, "routing", "rules");
      if (!outbounds.some((item) => matches(item, { protocol: "blackhole", tag: "block" }))) {
        errors.push("Системный outbound block нельзя удалить или изменить");
      }
      if (!rules.some((item) => matches(item, { type: "field", network: "udp", port: 443, outboundTag: "block" }))) {
        errors.push("Системное правило блокировки UDP/443 нельзя удалить или изменить");
      }
    }
  } catch (error) {
    errors.push(`Не удалось разобрать шаблон: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function renderedHash(rendered: string) {
  return createHash("sha256").update(rendered).digest("hex");
}

export function renderHysteria(template: string) {
  assertTemplate("hysteria", template);
  const rendered = template
    .replace("{{OUTPOST_TLS_CERT}}", `/etc/letsencrypt/live/${config.domain}/fullchain.pem`)
    .replace("{{OUTPOST_TLS_KEY}}", `/etc/letsencrypt/live/${config.domain}/privkey.pem`)
    .replace("{{OUTPOST_AUTH_URL}}", "http://127.0.0.1:8181/internal/hysteria/auth")
    .replace("{{OUTPOST_STATS_LISTEN}}", "127.0.0.1:9999")
    .replace("{{OUTPOST_STATS_SECRET}}", config.hysteriaStatsSecret);
  YAML.parse(rendered);
  return rendered;
}

export function renderXray(template: string, credentials: ConnectionCredential[]) {
  assertTemplate("xray", template);
  const users = JSON.stringify(credentials.map((item) => ({
    id: item.xray.id,
    email: item.xray.email,
    flow: "",
  })));
  const rendered = template
    .replace('"{{OUTPOST_STATS}}"', JSON.stringify({}))
    .replace('"{{OUTPOST_API}}"', JSON.stringify({ tag: "api", listen: "127.0.0.1:10085", services: ["HandlerService", "StatsService", "LoggerService"] }))
    .replace('"{{OUTPOST_XHTTP_USERS}}"', users)
    .replace('"{{OUTPOST_GRPC_USERS}}"', users)
    .replace("{{OUTPOST_XHTTP_PATH}}", config.xhttpPath)
    .replace("{{OUTPOST_GRPC_SERVICE}}", config.grpcService);
  JSON.parse(rendered);
  return rendered;
}

export class EngineConfigService {
  private journal: JournalService;

  constructor(private db: OutpostDatabase, journal?: JournalService) {
    this.journal = journal ?? new JournalService(db);
  }

  state(engine?: "hysteria" | "xray") {
    const names: Array<"hysteria" | "xray"> = engine ? [engine] : ["hysteria", "xray"];
    return Object.fromEntries(names.map((name) => [name, this.engineState(name)]));
  }

  preview(engine: "hysteria" | "xray", template: string, credentials: ConnectionCredential[] = []) {
    const check = validateTemplate(engine, template);
    if (!check.valid) return { ...check, rendered: null, hash: null };
    try {
      const rendered = engine === "hysteria" ? renderHysteria(template) : renderXray(template, credentials);
      const active = this.active(engine);
      const baseline = active?.template ?? (engine === "xray" ? defaultXrayTemplate : defaultHysteriaTemplate);
      const previous = this.renderStored(engine, baseline, credentials);
      return { valid: true, errors: [], rendered, hash: renderedHash(rendered), diff: lineDiff(previous, rendered) };
    } catch (error) {
      return { valid: false, errors: [String(error)], rendered: null, hash: null };
    }
  }

  async apply(
    engine: EngineName,
    template: string,
    credentials: ConnectionCredential[],
    actor = "owner",
    eventType: "engine.config_applied" | "engine.config_rolled_back" = "engine.config_applied",
    targetVersion?: number,
    presetVersion = currentEnginePresetVersions[engine],
    restart = true,
  ) {
    const preview = this.preview(engine, template, credentials);
    if (!preview.valid || !preview.rendered || !preview.hash) {
      throw new ServiceError(400, "Конфигурация не прошла проверку", preview.errors);
    }
    const version = (this.db.raw.query<{ version: number }, string>(
      "SELECT COALESCE(MAX(version), 0) AS version FROM engine_configs WHERE engine = ?",
    ).get(engine)?.version ?? 0) + 1;
    const id = crypto.randomUUID();
    const timestamp = now();
    const runtimeDir = join(config.dataDir, "runtime");
    const source = join(runtimeDir, `${engine}-config-${id}.${engine === "xray" ? "json" : "yaml"}`);
    mkdirSync(runtimeDir, { recursive: true, mode: 0o750 });
    writeFileSync(source, preview.rendered, { mode: 0o640 });
    const target = join(config.configDir, "engines", engine === "xray" ? "xray.json" : "hysteria.yaml");
    const result = config.demo
      ? { ok: true, demo: true }
      : await callAgent({ action: "config.apply", payload: { source, target, engine, restart } });
    this.db.raw.transaction(() => {
      this.db.raw.query("UPDATE engine_configs SET active = 0 WHERE engine = ?").run(engine);
      this.db.raw.query(`
        INSERT INTO engine_configs (id, engine, version, preset_version, template, rendered_hash, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `).run(id, engine, version, presetVersion, template, preview.hash, timestamp);
    })();
    const auditId = this.db.audit({
      actor,
      action: eventType === "engine.config_rolled_back" ? "engines.config.rollback" : "engines.config.apply",
      resource: "engine_config",
      resourceId: id,
      after: { engine, version, presetVersion, targetVersion, hash: preview.hash },
    });
    this.journal.record(eventType, {
      actor,
      auditId,
      source: engine,
      subjectType: "engine_config",
      subjectId: id,
      data: { engine, version, presetVersion, targetVersion },
    });
    return { ...this.engineState(engine), result };
  }

  async rollback(engine: "hysteria" | "xray", version: number, credentials: ConnectionCredential[], actor = "owner") {
    const row = this.db.raw.query<{ template: string; preset_version: number }, [string, number]>(
      "SELECT template, preset_version FROM engine_configs WHERE engine = ? AND version = ?",
    ).get(engine, version);
    if (!row) throw new ServiceError(404, "Ревизия конфигурации не найдена");
    const upgrade = mergeEnginePreset(engine, row.template, row.preset_version);
    if (upgrade.errors.length || upgrade.conflicts.length) {
      throw new ServiceError(409, "Ревизию нельзя безопасно совместить с текущим системным пресетом", {
        errors: upgrade.errors,
        conflicts: upgrade.conflicts,
      });
    }
    return this.apply(
      engine,
      upgrade.template,
      credentials,
      actor,
      "engine.config_rolled_back",
      version,
      upgrade.toVersion,
    );
  }

  async reconcilePresets(
    credentials: ConnectionCredential[],
    actor = "system:update",
    restart: Record<EngineName, boolean> = { hysteria: true, xray: true },
  ) {
    const results: Record<EngineName, unknown> = {} as Record<EngineName, unknown>;
    for (const engine of ["hysteria", "xray"] as const) {
      const active = this.active(engine);
      const currentVersion = currentEnginePresetVersions[engine];
      if (active && active.preset_version >= currentVersion) {
        results[engine] = { status: "current", presetVersion: active.preset_version, currentVersion };
        continue;
      }
      const upgrade = active
        ? mergeEnginePreset(engine, active.template, active.preset_version)
        : {
            template: engine === "hysteria" ? defaultHysteriaTemplate : defaultXrayTemplate,
            fromVersion: 0,
            toVersion: currentVersion,
            conflicts: [],
            errors: [],
          };
      const check = validateTemplate(engine, upgrade.template);
      if (upgrade.errors.length || upgrade.conflicts.length || !check.valid) {
        results[engine] = {
          status: upgrade.conflicts.length ? "conflict" : "invalid",
          fromVersion: upgrade.fromVersion,
          currentVersion,
          conflicts: upgrade.conflicts,
          errors: [...upgrade.errors, ...check.errors],
        };
        continue;
      }
      const applied = await this.apply(
        engine,
        upgrade.template,
        credentials,
        actor,
        "engine.config_applied",
        undefined,
        currentVersion,
        restart[engine],
      );
      results[engine] = {
        status: "applied",
        fromVersion: upgrade.fromVersion,
        currentVersion,
        activeVersion: applied.activeVersion,
      };
    }
    return { ok: true, engines: results };
  }

  private engineState(engine: "hysteria" | "xray") {
    const active = this.active(engine);
    const revisions = this.db.raw.query<{
      id: string; version: number; preset_version: number; rendered_hash: string; active: number; created_at: string;
    }, string>(`
      SELECT id, version, preset_version, rendered_hash, active, created_at
      FROM engine_configs WHERE engine = ? ORDER BY version DESC LIMIT 20
    `).all(engine);
    return {
      engine,
      activeVersion: active?.version ?? 0,
      template: active?.template ?? (engine === "xray" ? defaultXrayTemplate : defaultHysteriaTemplate),
      presetVersion: active?.preset_version ?? currentEnginePresetVersions[engine],
      preset: this.presetState(engine, active),
      revisions,
    };
  }

  private presetState(engine: EngineName, active: ReturnType<EngineConfigService["active"]>) {
    const currentVersion = currentEnginePresetVersions[engine];
    if (!active || active.preset_version === currentVersion) return { status: "current", currentVersion };
    if (active.preset_version > currentVersion) {
      return { status: "newer", currentVersion, errors: ["Конфигурация создана более новой версией Outpost"] };
    }
    const upgrade = mergeEnginePreset(engine, active.template, active.preset_version);
    const check = validateTemplate(engine, upgrade.template);
    return {
      status: upgrade.conflicts.length ? "conflict" : upgrade.errors.length || !check.valid ? "invalid" : "available",
      currentVersion,
      fromVersion: active.preset_version,
      template: upgrade.template,
      conflicts: upgrade.conflicts,
      errors: [...upgrade.errors, ...check.errors],
    };
  }

  private active(engine: "hysteria" | "xray") {
    return this.db.raw.query<{
      id: string; version: number; preset_version: number; template: string; rendered_hash: string; created_at: string;
    }, string>("SELECT id, version, preset_version, template, rendered_hash, created_at FROM engine_configs WHERE engine = ? AND active = 1").get(engine);
  }

  private renderStored(engine: "hysteria" | "xray", template: string, credentials: ConnectionCredential[]) {
    try { return engine === "hysteria" ? renderHysteria(template) : renderXray(template, credentials); }
    catch { return null; }
  }
}

function lineDiff(before: string | null, after: string) {
  if (before === after) return "Без изменений";
  if (before === null) return after.split("\n").map((line) => `+ ${line}`).join("\n");
  const left = before.split("\n");
  const right = after.split("\n");
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  return [
    ...left.slice(prefix, left.length - suffix).map((line) => `- ${line}`),
    ...right.slice(prefix, right.length - suffix).map((line) => `+ ${line}`),
  ].join("\n") || "Без изменений";
}

function assertTemplate(engine: keyof typeof protectedBlocks, template: string) {
  const result = validateTemplate(engine, template);
  if (!result.valid) throw new Error(result.errors.join("; "));
}

function count(text: string, needle: string) {
  return text.split(needle).length - 1;
}

function nestedArray(value: unknown, ...path: string[]): unknown[] {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return [];
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : [];
}

function matches(value: unknown, expected: Record<string, unknown>) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.entries(expected).every(([key, entry]) => (value as Record<string, unknown>)[key] === entry);
}
