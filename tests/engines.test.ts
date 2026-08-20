import { describe, expect, test } from "bun:test";
import {
  defaultHysteriaTemplate,
  defaultXrayTemplate,
  EngineConfigService,
  renderHysteria,
  renderXray,
  validateTemplate,
} from "../src/server/adapters/engines";
import { renderXrayUserAdd } from "../src/server/services/engine-runtime";
import { database } from "./helpers";
import { config } from "../src/server/config";

describe("protected engine templates", () => {
  test("requires every protected block exactly once", () => {
    expect(validateTemplate("hysteria", defaultHysteriaTemplate).valid).toBeTrue();
    expect(validateTemplate("hysteria", defaultHysteriaTemplate.replace("{{OUTPOST_TLS_KEY}}", "raw-key"))).toEqual({
      valid: false,
      errors: ["Защищённый блок {{OUTPOST_TLS_KEY}} должен встречаться ровно один раз"],
    });
    expect(validateTemplate("xray", `${defaultXrayTemplate}\n{{OUTPOST_API}}`).valid).toBeFalse();
  });

  test("renders syntactically valid configs without unresolved blocks", () => {
    const credential = {
      connectionId: "connection",
      generation: 1,
      hysteria: { id: "connection", password: "password" },
      xray: { id: "f8e5bb4d-483a-4f57-b2fe-cda0d799cb83", email: "connection.1@outpost.local" },
    };
    const hysteria = renderHysteria(defaultHysteriaTemplate);
    const xray = renderXray(defaultXrayTemplate, [credential]);
    expect(hysteria).not.toContain("{{OUTPOST");
    const inbounds = JSON.parse(xray).inbounds;
    expect(inbounds.map((inbound: { tag: string }) => inbound.tag)).toEqual(["vless-xhttp", "vless-grpc"]);
    expect(inbounds.every((inbound: { settings: { clients: Array<{ email: string }> } }) => inbound.settings.clients[0]?.email === credential.xray.email)).toBeTrue();
  });

  test("renders a complete inbound for the Xray hot-add API", () => {
    const source = renderXrayUserAdd({
      connectionId: "connection",
      generation: 1,
      hysteria: { id: "connection", password: "password" },
      xray: { id: "f8e5bb4d-483a-4f57-b2fe-cda0d799cb83", email: "connection.1@outpost.local" },
    });

    expect(source.inbounds[0]).toMatchObject({
      tag: "vless-xhttp",
      listen: "127.0.0.1",
      port: 10000,
      protocol: "vless",
      streamSettings: { network: "xhttp", xhttpSettings: { path: config.xhttpPath, mode: "auto" } },
    });
    expect(source.inbounds[1]).toMatchObject({
      tag: "vless-grpc",
      listen: "127.0.0.1",
      port: 10001,
      protocol: "vless",
      streamSettings: { network: "grpc", grpcSettings: { serviceName: config.grpcService } },
    });
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
