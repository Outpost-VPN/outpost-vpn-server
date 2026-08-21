import { describe, expect, test } from "bun:test";
import {
  currentEnginePresetVersions,
  enginePreset,
  mergeEnginePreset,
  parseEngineTemplate,
} from "../src/server/adapters/engine-presets";
import { EngineConfigService } from "../src/server/adapters/engines";
import { config } from "../src/server/config";
import { now } from "../src/server/db/database";
import { database } from "./helpers";

describe("versioned engine presets", () => {
  test("keeps Hysteria user changes and adds new system ACL entries", () => {
    const customized = `# user header\n${enginePreset("hysteria", 1)!.replace("https://news.ycombinator.com/", "https://example.com/ # user masquerade")}`;
    const result = mergeEnginePreset("hysteria", customized, 1);
    const merged = parseEngineTemplate("hysteria", result.template) as {
      masquerade: { proxy: { url: string } };
      acl: { inline: string[] };
    };

    expect(result.errors).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(merged.masquerade.proxy.url).toBe("https://example.com/");
    expect(merged.acl.inline).toEqual(["reject(all, udp/443)"]);
    expect(result.template).toContain("{{OUTPOST_AUTH_URL}}");
    expect(result.template).toContain("# user header");
    expect(result.template).toContain("https://example.com/ # user masquerade");
  });

  test("merges Xray arrays by stable tags and routing rules by value", () => {
    const customized = JSON.parse(enginePreset("xray", 1)!);
    customized.log.loglevel = "error";
    customized.outbounds.push({ protocol: "socks", tag: "private", settings: { servers: [] } });
    customized.routing = {
      domainStrategy: "IPIfNonMatch",
      rules: [{ type: "field", domain: ["example.com"], outboundTag: "private" }],
    };

    const result = mergeEnginePreset("xray", JSON.stringify(customized, null, 2), 1);
    const merged = JSON.parse(result.template);

    expect(result.conflicts).toEqual([]);
    expect(merged.log.loglevel).toBe("error");
    expect(merged.outbounds.map((item: { tag: string }) => item.tag)).toEqual(["direct", "private", "block"]);
    expect(merged.routing.domainStrategy).toBe("IPIfNonMatch");
    expect(merged.routing.rules).toContainEqual({ type: "field", domain: ["example.com"], outboundTag: "private" });
    expect(merged.routing.rules).toContainEqual({ type: "field", network: "udp", port: 443, outboundTag: "block" });
  });

  test("preserves a user deletion when the preset did not change that field", () => {
    const customized = JSON.parse(enginePreset("xray", 1)!);
    delete customized.log;

    const result = mergeEnginePreset("xray", JSON.stringify(customized, null, 2), 1);
    expect(result.conflicts).toEqual([]);
    expect(JSON.parse(result.template).log).toBeUndefined();
  });

  test("reports a collision when user and preset add the same array tag differently", () => {
    const customized = JSON.parse(enginePreset("xray", 1)!);
    customized.outbounds.push({ protocol: "freedom", tag: "block" });

    const result = mergeEnginePreset("xray", JSON.stringify(customized, null, 2), 1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      path: "/outbounds[tag=block]",
      reason: "same_array_key_added",
      missing: { base: true, user: false, preset: false },
    });
  });

  test("reconciles an existing revision once and records the new preset version", async () => {
    const fixture = database();
    const previousDemo = config.demo;
    try {
      (config as unknown as { demo: boolean }).demo = true;
      const customized = enginePreset("xray", 1)!.replace('"warning"', '"error"');
      fixture.db.raw.query(`
        INSERT INTO engine_configs (id, engine, version, preset_version, template, rendered_hash, active, created_at)
        VALUES (?, 'xray', 1, 1, ?, 'old', 1, ?)
      `).run(crypto.randomUUID(), customized, now());

      const service = new EngineConfigService(fixture.db);
      const first = await service.reconcilePresets([], "test:update");
      const second = await service.reconcilePresets([], "test:update");
      const state = service.state("xray").xray!;

      expect(first.engines.xray).toMatchObject({ status: "applied", fromVersion: 1, currentVersion: 2 });
      expect(second.engines.xray).toMatchObject({ status: "current", presetVersion: 2 });
      expect(state.presetVersion).toBe(currentEnginePresetVersions.xray);
      expect(JSON.parse(state.template).log.loglevel).toBe("error");
      expect(JSON.parse(state.template).routing.rules).toContainEqual({
        type: "field", network: "udp", port: 443, outboundTag: "block",
      });
    } finally {
      (config as unknown as { demo: boolean }).demo = previousDemo;
      fixture.close();
    }
  });

  test("leaves a conflicting active revision untouched for manual resolution", async () => {
    const fixture = database();
    const previousDemo = config.demo;
    try {
      (config as unknown as { demo: boolean }).demo = true;
      const customized = JSON.parse(enginePreset("xray", 1)!);
      customized.outbounds.push({ protocol: "freedom", tag: "block" });
      fixture.db.raw.query(`
        INSERT INTO engine_configs (id, engine, version, preset_version, template, rendered_hash, active, created_at)
        VALUES (?, 'xray', 1, 1, ?, 'old', 1, ?)
      `).run(crypto.randomUUID(), JSON.stringify(customized, null, 2), now());

      const service = new EngineConfigService(fixture.db);
      const result = await service.reconcilePresets([], "test:update");
      const state = service.state("xray").xray!;

      expect(result.engines.xray).toMatchObject({ status: "conflict", fromVersion: 1, currentVersion: 2 });
      expect(state.activeVersion).toBe(1);
      expect(state.preset.status).toBe("conflict");
      expect(state.preset.conflicts?.[0]?.path).toBe("/outbounds[tag=block]");
    } finally {
      (config as unknown as { demo: boolean }).demo = previousDemo;
      fixture.close();
    }
  });

  test("rebases rollback of an old revision onto the current protected preset", async () => {
    const fixture = database();
    const previousDemo = config.demo;
    try {
      (config as unknown as { demo: boolean }).demo = true;
      fixture.db.raw.query(`
        INSERT INTO engine_configs (id, engine, version, preset_version, template, rendered_hash, active, created_at)
        VALUES (?, 'hysteria', 1, 1, ?, 'old', 0, ?)
      `).run(
        crypto.randomUUID(),
        enginePreset("hysteria", 1)!.replace("news.ycombinator.com", "example.com"),
        now(),
      );

      const service = new EngineConfigService(fixture.db);
      const rolledBack = await service.rollback("hysteria", 1, [], "test");
      const merged = parseEngineTemplate("hysteria", rolledBack.template) as {
        masquerade: { proxy: { url: string } };
        acl: { inline: string[] };
      };

      expect(rolledBack.presetVersion).toBe(2);
      expect(merged.masquerade.proxy.url).toBe("https://example.com/");
      expect(merged.acl.inline).toEqual(["reject(all, udp/443)"]);
    } finally {
      (config as unknown as { demo: boolean }).demo = previousDemo;
      fixture.close();
    }
  });
});
