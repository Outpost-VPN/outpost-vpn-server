import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";
import type { JournalEventInput } from "../models";
import { defaultRoutes, migrations } from "./schema";

export type SqlValue = string | number | bigint | boolean | Uint8Array | null;

export class OutpostDatabase {
  readonly raw: Database;

  constructor(path = config.databasePath) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.raw = new Database(path, { create: true, strict: true });
    this.raw.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.migrate();
    this.seed();
  }

  migrate() {
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const applied = new Set(
      this.raw.query<{ version: number }, []>("SELECT version FROM schema_migrations").all().map((row) => row.version),
    );
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.raw.transaction(() => {
        this.raw.exec(migration.sql);
        this.raw.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(migration.version, migration.name, now());
      })();
    }
  }

  seed() {
    const count = this.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM route_drafts").get()?.count ?? 0;
    if (count === 0) {
      const insert = this.raw.query(`
        INSERT INTO route_drafts
          (id, position, action, matcher, value, source, locked, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
      this.raw.transaction(() => {
        defaultRoutes.forEach((rule, position) => {
          const timestamp = now();
          insert.run(crypto.randomUUID(), position, rule.action, rule.matcher, rule.value, rule.source, rule.locked ? 1 : 0, timestamp, timestamp);
        });
      })();
    }
    this.setDefault("active_route_version", 0);
    this.publishInitialRoutes();
    this.setDefault("interface", { language: "ru", compact: false });
    this.setDefault("system", { timezone: "UTC", updateChannel: "stable" });
    this.setDefault("engine_order", ["hysteria", "xray"]);
    this.raw.query(`
      INSERT OR IGNORE INTO engine_versions (engine, installed_version, desired_version, checksum, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("hysteria", "2.12.1", "2.12.1", "ffc032c7ca6b78676d337097ca7f61bebc3a90a4f3a656693adf368f304cdbc7", now());
    this.raw.query(`
      INSERT OR IGNORE INTO engine_versions (engine, installed_version, desired_version, checksum, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("xray", "26.7.28", "26.7.28", "8195d909f1109b8f3d99eefe401a3c451d7bf4af71f24d3815420f77e5dd2a40", now());
  }

  private publishInitialRoutes() {
    const active = this.setting<number>("active_route_version", 0);
    const revisions = this.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM route_revisions").get()?.count ?? 0;
    if (active !== 0 || revisions !== 0) return;

    const rules = this.raw.query<{
      id: string;
      position: number;
      action: string;
      matcher: string;
      value: string;
      source: string;
      locked: number;
      enabled: number;
      created_at: string;
      updated_at: string;
    }, []>("SELECT * FROM route_drafts ORDER BY position").all();
    const defaults = rules.length === defaultRoutes.length && rules.every((rule, position) => {
      const expected = defaultRoutes[position];
      return expected
        && rule.action === expected.action
        && rule.matcher === expected.matcher
        && rule.value === expected.value
        && rule.source === expected.source
        && Boolean(rule.locked) === expected.locked
        && Boolean(rule.enabled);
    });
    if (!defaults) return;

    const timestamp = now();
    this.raw.transaction(() => {
      this.raw.query(`
        INSERT INTO route_revisions (id, version, rules_json, note, created_at, actor)
        VALUES (?, 1, ?, ?, ?, 'system')
      `).run(crypto.randomUUID(), JSON.stringify(rules), "Базовые правила", timestamp);
      this.setSetting("active_route_version", 1);
    })();
  }

  setting<T>(key: string, fallback: T): T {
    const row = this.raw.query<{ value_json: string }, string>("SELECT value_json FROM settings WHERE key = ?").get(key);
    return row ? JSON.parse(row.value_json) as T : fallback;
  }

  setSetting(key: string, value: unknown) {
    this.raw.query(`
      INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), now());
  }

  setDefault(key: string, value: unknown) {
    this.raw.query("INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)")
      .run(key, JSON.stringify(value), now());
  }

  audit(entry: {
    actor: string;
    action: string;
    resource: string;
    resourceId?: string;
    before?: unknown;
    after?: unknown;
    ip?: string;
  }): number {
    const result = this.raw.query(`
      INSERT INTO audit_log (actor, action, resource, resource_id, before_json, after_json, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.actor,
      entry.action,
      entry.resource,
      entry.resourceId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.ip ?? null,
      now(),
    );
    return Number(result.lastInsertRowid);
  }

  event(entry: JournalEventInput): number {
    const result = this.raw.query(`
      INSERT INTO events (
        type, category, kind, severity, outcome, important, source, actor,
        subject_type, subject_id, operation_id, audit_id, data_json, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.type,
      entry.category,
      entry.kind,
      entry.severity ?? "info",
      entry.outcome ?? null,
      entry.important ? 1 : 0,
      entry.source,
      entry.actor ?? null,
      entry.subjectType ?? null,
      entry.subjectId ?? null,
      entry.operationId ?? null,
      entry.auditId ?? null,
      JSON.stringify(entry.data ?? {}),
      entry.occurredAt ?? now(),
    );
    return Number(result.lastInsertRowid);
  }

  close() {
    this.raw.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.raw.close();
  }
}

export function now() {
  return new Date().toISOString();
}

export function addHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
