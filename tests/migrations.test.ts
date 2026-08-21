import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OutpostDatabase } from "../src/server/db/database";
import { migrations } from "../src/server/db/schema";
import { SystemService } from "../src/server/services/system";
import { database } from "./helpers";

describe("clean prerelease schema", () => {
  test("keeps the initial migration and adds owner language separately", () => {
    expect(migrations).toHaveLength(2);
    expect(migrations[0]).toMatchObject({ version: 1, name: "initial" });
    expect(migrations[1]).toMatchObject({ version: 2, name: "owner-language" });

    const fixture = database();
    try {
      const tables = fixture.db.raw.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      ).all().map((row) => row.name);
      for (const table of [
        "connections", "credentials", "connection_sync_jobs", "connection_presence",
        "traffic_cursors", "traffic_samples",
      ]) expect(tables).toContain(table);
      for (const removed of [
        "people", "devices", "accesses", "device_sync_jobs", "access_sync_jobs",
        "device_presence", "access_presence",
      ]) expect(tables).not.toContain(removed);

      const columns = fixture.db.raw.query<{ name: string }, []>("PRAGMA table_info(connections)").all().map((row) => row.name);
      for (const column of [
        "id", "serial", "name", "color", "avatar", "status", "generation",
        "created_at", "activated_at", "first_used_at", "last_fetched_at", "first_seen_at", "last_seen_at",
      ]) expect(columns).toContain(column);
      for (const removed of ["note", "person_id", "role", "kind", "platform", "last_profile_format", "last_routes_version"]) {
        expect(columns).not.toContain(removed);
      }
      expect(fixture.db.raw.query("PRAGMA foreign_key_check").all()).toEqual([]);
      const ownerColumns = fixture.db.raw.query<{ name: string }, []>("PRAGMA table_info(owners)").all().map((row) => row.name);
      expect(ownerColumns).toContain("language");
    } finally {
      fixture.close();
    }
  });

  test("connection credentials are keyed by connection, generation and engine", () => {
    const fixture = database();
    try {
      const foreignKeys = fixture.db.raw.query<{ table: string; from: string; to: string }, []>(
        "PRAGMA foreign_key_list(credentials)",
      ).all();
      expect(foreignKeys.find((key) => key.from === "connection_id")).toMatchObject({ table: "connections", to: "id" });
      const indexes = fixture.db.raw.query<{ name: string }, []>("PRAGMA index_list(credentials)").all().map((row) => row.name);
      expect(indexes).toContain("credentials_active");
      const unique = indexes.find((name) => name.startsWith("sqlite_autoindex_credentials_"))!;
      const uniqueColumns = fixture.db.raw.query<{ name: string }, []>(`PRAGMA index_info('${unique}')`).all().map((row) => row.name);
      expect(uniqueColumns).toEqual(["connection_id", "generation", "engine"]);
    } finally {
      fixture.close();
    }
  });

  test("interface settings no longer own the language or avatar", () => {
    const fixture = database();
    try {
      const system = new SystemService(fixture.db);
      expect(system.settings().interface).toEqual({ compact: false });
      expect(() => system.updateSettings({ interface: { language: "ru", ownerAvatar: "avatar-9" } })).toThrow();
      expect(system.settings().interface).not.toHaveProperty("language");
      expect(system.settings().interface).not.toHaveProperty("ownerAvatar");
    } finally {
      fixture.close();
    }
  });

  test("v2 migrates the legacy interface language to the owner", () => {
    const directory = mkdtempSync(join(tmpdir(), "outpost-migration-"));
    const path = join(directory, "legacy.sqlite");
    const legacy = new Database(path, { create: true, strict: true });
    try {
      legacy.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
        ${migrations[0].sql}
        INSERT INTO schema_migrations VALUES (1, 'initial', '2026-01-01T00:00:00.000Z');
        INSERT INTO owners (id, timezone, created_at, updated_at)
          VALUES ('owner', 'Europe/Moscow', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
        INSERT INTO settings (key, value_json, updated_at)
          VALUES ('interface', '{"language":"zh-CN","compact":true}', '2026-01-01T00:00:00.000Z');
      `);
    } finally {
      legacy.close();
    }

    const upgraded = new OutpostDatabase(path);
    try {
      expect(upgraded.raw.query<{ language: string }, []>("SELECT language FROM owners").get()?.language).toBe("zh-CN");
      expect(upgraded.setting("interface", {})).toEqual({ compact: true });
      expect(upgraded.raw.query<{ version: number }, []>("SELECT MAX(version) AS version FROM schema_migrations").get()?.version).toBe(2);
    } finally {
      upgraded.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
