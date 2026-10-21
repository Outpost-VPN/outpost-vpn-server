import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import {
  defaultHysteriaTemplate,
  defaultXrayTemplate,
  EngineConfigService,
  renderHysteria,
  renderXray,
  renderEngine,
  validateTemplate,
} from "../src/server/adapters/engines";
import { renderXrayUserAdd } from "../src/server/services/engine-runtime";
import { database } from "./helpers";
import { config } from "../src/server/config";
import {defaultEngineTemplates} from "../src/server/adapters/engine-presets";
import {engineApi, engineApiSecret} from "../src/server/adapters/engine-api";
import {runtimePorts} from "../src/server/adapters/engine-ports";

describe("protected engine templates", () => {
  test("keeps Hysteria installation and runtime defaults free of fixed bandwidth targets", () => {
    const templates = [
      renderHysteria(defaultHysteriaTemplate),
      readFileSync(resolve(import.meta.dir, "../infra/config/hysteria.yaml.template"), "utf8"),
    ];
    for (const template of templates) {
      const profile = YAML.parse(template);
      expect(profile.bandwidth).toBeUndefined();
      expect(profile.ignoreClientBandwidth).toBeUndefined();
    }
  });

  test("keeps the authenticated sing-box telemetry service on loopback and out of public ingress", () => {
    const template = defaultEngineTemplates["sing-box"];
    const rendered = renderEngine("sing-box", template, [], []);
    const service = JSON.parse(rendered).services[0];
    expect(service).toMatchObject({type: "api", listen: "127.0.0.1", listen_port: 10086, secret: engineApiSecret("sing-box")});
    expect(`${service.listen}:${service.listen_port}`).toBe(engineApi["sing-box"]);
    expect(runtimePorts("sing-box", rendered)).toEqual([]);
    expect(runtimePorts("sing-box", rendered, true)).toEqual(["10086/tcp"]);
    expect(validateTemplate("sing-box", template.replace("{{OUTPOST_API}}", "custom")).valid).toBeFalse();
  });
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
    expect(YAML.parse(hysteria).acl.inline).toEqual(["reject(all, udp/443)"]);
    const xrayConfig = JSON.parse(xray);
    const inbounds = xrayConfig.inbounds;
    expect(inbounds.map((inbound: { tag: string }) => inbound.tag)).toEqual(["vless-xhttp", "vless-grpc"]);
    expect(inbounds.every((inbound: { settings: { clients: Array<{ email: string }> } }) => inbound.settings.clients[0]?.email === credential.xray.email)).toBeTrue();
    expect(xrayConfig.outbounds.at(-1)).toMatchObject({ protocol: "blackhole", tag: "block" });
    expect(xrayConfig.routing.rules).toContainEqual({ type: "field", network: "udp", port: 443, outboundTag: "block" });
  });

  test("installation templates reject tunneled QUIC on both server engines", () => {
    const hysteria = YAML.parse(readFileSync(resolve(import.meta.dir, "../infra/config/hysteria.yaml.template"), "utf8"));
    const xray = JSON.parse(readFileSync(resolve(import.meta.dir, "../infra/config/xray.json.template"), "utf8"));

    expect(hysteria.acl.inline).toEqual(["reject(all, udp/443)"]);
    expect(xray.outbounds.at(-1)).toMatchObject({ protocol: "blackhole", tag: "block" });
    expect(xray.routing.rules).toContainEqual({ type: "field", network: "udp", port: 443, outboundTag: "block" });
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
