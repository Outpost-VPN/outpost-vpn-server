import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SystemService } from "../src/server/services/system";
import { database } from "./helpers";

describe("system settings", () => {
  let fixture: ReturnType<typeof database>;

  beforeEach(() => { fixture = database(); });
  afterEach(() => fixture.close());

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
