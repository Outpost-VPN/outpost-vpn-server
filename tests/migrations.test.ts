import { describe, expect, test } from "bun:test";
import { migrations } from "../src/server/db/schema";
import { SystemService } from "../src/server/services/system";
import { database } from "./helpers";

describe("clean prerelease schema", () => {
  test("contains one initial migration built around connections", () => {
    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toMatchObject({ version: 1, name: "initial" });

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

  test("interface settings do not accept or return an owner avatar", () => {
    const fixture = database();
    try {
      const system = new SystemService(fixture.db);
      expect(system.settings().interface).toEqual({ language: "ru", compact: false });
      expect(() => system.updateSettings({ interface: { language: "ru", ownerAvatar: "avatar-9" } })).toThrow();
      expect(system.settings().interface).not.toHaveProperty("ownerAvatar");
    } finally {
      fixture.close();
    }
  });
});
