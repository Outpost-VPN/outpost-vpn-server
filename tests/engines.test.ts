import { describe, expect, test } from "bun:test";
import {
  defaultHysteriaTemplate,
  defaultXrayTemplate,
  EngineConfigService,
  renderHysteria,
  renderXray,
  validateTemplate,
} from "../src/server/adapters/engines";
import { database } from "./helpers";
import { config } from "../src/server/config";

describe("protected engine templates", () => {
  test("requires every protected block exactly once", () => {
    expect(validateTemplate("hysteria", defaultHysteriaTemplate).valid).toBeTrue();
    expect(validateTemplate("hysteria", defaultHysteriaTemplate.replace("{{MATRESHKA_TLS_KEY}}", "raw-key"))).toEqual({
      valid: false,
      errors: ["Защищённый блок {{MATRESHKA_TLS_KEY}} должен встречаться ровно один раз"],
    });
    expect(validateTemplate("xray", `${defaultXrayTemplate}\n{{MATRESHKA_API}}`).valid).toBeFalse();
  });

  test("renders syntactically valid configs without unresolved blocks", () => {
    const credential = {
      deviceId: "device",
      hysteria: { id: "device", password: "password" },
      xray: { id: "f8e5bb4d-483a-4f57-b2fe-cda0d799cb83", email: "device@matreshka.local" },
    };
    const hysteria = renderHysteria(defaultHysteriaTemplate);
    const xray = renderXray(defaultXrayTemplate, [credential]);
    expect(hysteria).not.toContain("{{MATRESHKA");
    expect(JSON.parse(xray).inbounds[0].settings.clients[0].email).toBe(credential.xray.email);
  });

  test("uses the built-in template as the diff baseline before the first apply", () => {
    const fixture = database();
    try {
      const service = new EngineConfigService(fixture.db);
      expect(service.preview("xray", defaultXrayTemplate).diff).toBe("Без изменений");
      expect(service.preview("hysteria", defaultHysteriaTemplate).diff).toBe("Без изменений");
    } finally {
      fixture.close();
    }
  });

  test("stores an applied template as a revision without overwriting it on startup", async () => {
    const fixture = database();
    const previousDemo = config.demo;
    try {
      (config as unknown as { demo: boolean }).demo = true;
      const service = new EngineConfigService(fixture.db);
      const customized = defaultXrayTemplate.replace('"warning"', '"error"');
      const applied = await service.apply("xray", customized, [], "test");
      expect(applied.activeVersion).toBe(1);
      expect(service.state("xray").xray!.template).toBe(customized);
    } finally {
      (config as unknown as { demo: boolean }).demo = previousDemo;
      fixture.close();
    }
  });
});
