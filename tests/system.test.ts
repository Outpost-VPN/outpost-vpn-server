import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SystemService } from "../src/server/services/system";
import { database } from "./helpers";
import { networkDefaults } from "../src/shared/settings";
import { OutpostDatabase } from "../src/server/db/database";
import { join } from "node:path";

describe("system settings", () => {
  let fixture: ReturnType<typeof database>;

  beforeEach(() => { fixture = database(); });
  afterEach(() => fixture.close());

  test("migrates network defaults and preserves partial settings across service and database restarts", () => {
    const system = new SystemService(fixture.db);
    expect(system.networkSettings()).toEqual(networkDefaults);
    system.updateSettings({ network: { ipv6: true, mihomo: { tlsPorts: [443, "8000-8100"] } } }, "token:mcp");
    fixture.db.seed();
    fixture.db.migrate();
    const reopened = new OutpostDatabase(join(fixture.directory, "test.sqlite"));
    const restored = new SystemService(reopened).networkSettings();
    reopened.close();
    expect(restored.ipv6).toBeTrue();
    expect(restored.mihomo.tlsPorts).toEqual([443, "8000-8100"]);
    expect(restored.mihomo.httpPorts).toEqual(networkDefaults.mihomo.httpPorts);
    expect(restored.blockQuic).toBeTrue();
    expect(fixture.db.raw.query<{actor: string}, []>("SELECT actor FROM audit_log WHERE action = 'settings.update'").get()?.actor).toBe("token:mcp");
  });

  test("rejects invalid network settings atomically without losing a working profile", () => {
    const system = new SystemService(fixture.db);
    for (const network of [
      { ipv6: "yes" }, { arbitrary: true }, { mihomo: { dnsMode: "broken" } },
      ...[[], [0], [65536], ["9000-8000"], ["443\nMATCH,DIRECT"], Array(65).fill(443)]
        .map(tlsPorts => ({ mihomo: { tlsPorts } })),
    ]) {
      expect(() => system.updateSettings({ interface: { compact: true }, network })).toThrow();
      expect(system.settings().interface.compact).toBeFalse();
      expect(system.networkSettings()).toEqual(networkDefaults);
    }
  });

  test("persists engine priority as the subscription source of truth", () => {
    const system = new SystemService(fixture.db);
    expect(system.engineOrder()).toEqual(["hysteria", "xray"]);

    system.updateEngineOrder(["xray", "hysteria"], "owner");

    expect(new SystemService(fixture.db).engineOrder()).toEqual(["xray", "hysteria"]);
    expect(fixture.db.setting<string[]>("engine_order", [])).toEqual(["xray", "hysteria"]);
  });

  test("rejects missing, duplicate and unknown engines", () => {
    const system = new SystemService(fixture.db);
    expect(() => system.updateEngineOrder(["hysteria"], "owner")).toThrow();
    expect(() => system.updateEngineOrder(["hysteria", "hysteria"], "owner")).toThrow();
    expect(() => system.updateEngineOrder(["hysteria", "unknown"], "owner")).toThrow();
  });

  test("defaults prerelease installations to the candidate channel and validates changes", () => {
    const system = new SystemService(fixture.db);
    expect(system.settings().system.updateChannel).toBe("candidate");

    expect(system.updateSettings({ system: { updateChannel: "stable" } }).system.updateChannel).toBe("stable");
    expect(system.updates.state()).toMatchObject({ status: "idle", channel: "stable" });
    expect(() => system.updateSettings({ system: { updateChannel: "nightly" } })).toThrow();
    expect(system.settings().system.updateChannel).toBe("stable");
  });
});
