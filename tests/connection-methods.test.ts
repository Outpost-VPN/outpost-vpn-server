import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import YAML from "yaml";
import { database } from "./helpers";
import { ConnectionMethodService } from "../src/server/services/connection-methods";
import { ConnectionService } from "../src/server/services/connections";
import { engineIds, engines } from "../src/shared/engines";
import { defaultMethods, methodSettings, type ConnectionMethod } from "../src/shared/connection-methods";
import { renderEngine } from "../src/server/adapters/engines";
import { defaultEngineTemplates } from "../src/server/adapters/engine-presets";
import { runtimePorts } from "../src/server/adapters/engine-ports";
import { renderers, type SubscriptionContext } from "../src/server/adapters/subscriptions";

describe("connection method ownership", () => {
  let fixture: ReturnType<typeof database>;
  let service: ConnectionMethodService;
  beforeEach(() => { fixture = database(); service = new ConnectionMethodService(fixture.db, async () => {}); });
  afterEach(() => fixture.close());
  const method = (engine: "mihomo" | "sing-box", protocol: "anytls" | "grpc" | "xhttp" = "anytls", port = 1443) => ({ engine, protocol,
    name: `${engine} ${protocol}`, enabled: true, settings: { ...methodSettings(engine, protocol), port } });

  test("migrates configured default listeners once, preserving historical order", () => {
    fixture.db.raw.query("DELETE FROM settings WHERE key = 'connection_methods'").run();
    fixture.db.engines.recordInstallation("mihomo", engines.mihomo.version);
    fixture.db.setSetting("engine_order", ["xray", "hysteria", "mihomo"]);
    fixture.db.methods.migrate();
    expect(fixture.db.methods.list().map((method) => method.protocol)).toEqual(["xhttp", "grpc", "hysteria2", "anytls", "trusttunnel"]);
    fixture.db.setSetting("connection_methods", []);
    fixture.db.methods.migrate();
    expect(fixture.db.methods.list()).toEqual([]);
  });

  test("saves independent implementations and applies before publishing the new state", async () => {
    for (const engine of ["mihomo", "sing-box"] as const) fixture.db.engines.recordInstallation(engine, engines[engine].version);
    const calls: string[] = [];
    const service = new ConnectionMethodService(fixture.db, async (engine, next) => {
      expect(fixture.db.methods.list()).toHaveLength(calls.length + 3);
      expect(next).toHaveLength(calls.length + 4);
      calls.push(engine);
    });
    const first = await service.save(method("mihomo"), "owner");
    const second = await service.save(method("sing-box", "anytls", 2444), "owner");
    expect(first.id).not.toBe(second.id);
    expect(calls).toEqual(["mihomo", "sing-box"]);
    const before = service.list();
    const failed = new ConnectionMethodService(fixture.db, async () => { throw Error("Native configuration rejected"); });
    await expect(failed.save({ ...method("mihomo"), name: "Changed", settings: { port: 5444 } }, "owner", first.id)).rejects.toThrow("Native configuration rejected");
    expect(service.list()).toEqual(before);
  });

  test("rejects uninstalled cores, unsupported server transports, reserved and overlapping sockets", async () => {
    await expect(service.save(method("mihomo"), "owner")).rejects.toThrow("Install");
    for (const engine of ["mihomo", "sing-box"] as const) fixture.db.engines.recordInstallation(engine, engines[engine].version);
    await expect(service.save({...method("mihomo"), name:"PROXY"}, "owner")).rejects.toThrow("reserved");
    await service.save(method("mihomo"), "owner");
    await expect(service.save(method("sing-box"), "owner")).rejects.toThrow("port and network");
    await expect(service.save(method("sing-box", "xhttp", 5444), "owner")).rejects.toThrow("Unsupported");
    await expect(service.save(method("sing-box", "grpc", 8443), "owner")).rejects.toThrow("reserved");
    const candidate = { ...method("sing-box"), name: "Disabled", enabled: false };
    const disabled = await service.save(candidate, "owner");
    await expect(service.save({ ...candidate, enabled: true }, "owner", disabled.id)).rejects.toThrow("port and network");
    expect(fixture.db.methods.list().find((method) => method.id === disabled.id)?.enabled).toBeFalse();
  });

  test("reorders methods independently of engine and permits an intentionally empty configuration", async () => {
    const before = fixture.db.methods.list();
    await expect(service.reorder([before[0]!.id], "owner")).rejects.toThrow();
    await expect(service.reorder(before.map(() => before[0]!.id), "owner")).rejects.toThrow();
    const reversed = before.map((method) => method.id).reverse();
    await service.reorder(reversed, "owner");
    expect(fixture.db.methods.list().map((method) => method.id)).toEqual(reversed);
    for (const id of reversed) await service.remove(id, "owner");
    expect(fixture.db.methods.list()).toEqual([]);
  });

  test("renders and exports the same settings across server providers and filters by the client profile", async () => {
    for (const id of engineIds) fixture.db.engines.recordInstallation(id, engines[id].version);
    await service.save(method("mihomo"), "owner");
    const alternate = await service.save(method("sing-box", "anytls", 2444), "owner");
    const connections = new ConnectionService(fixture.db);
    const connection = connections.create({ name: "Client" });
    const credentials = connections.credentials(connection.id);
    const methods = fixture.db.methods.list();
    const context = { connection, credentials, routes: [], subscriptionToken: "test", methods, enabledEngines: engineIds } as SubscriptionContext;
    const server = JSON.parse(renderEngine("sing-box", defaultEngineTemplates["sing-box"], [credentials], methods));
    expect(server.inbounds[0]).toMatchObject({ type: "anytls", listen_port: 2444 });
    expect(runtimePorts("sing-box", JSON.stringify(server))).toEqual(["2444/tcp"]);
    const modern = YAML.parse(renderers.mihomo.render({ ...context, clientProfile: "mihomo-modern" }).body);
    expect(modern.proxies.filter((proxy: any) => proxy.type === "anytls").map((proxy: any) => proxy.port)).toEqual([1443, 2444]);
    expect(YAML.parse(renderers.mihomo.render({ ...context, clientProfile: "mihomo" }).body).proxies).toHaveLength(3);
    expect(JSON.parse(renderers["sing-box"].render({ ...context, clientProfile: "sing-box-modern" }).body).outbounds.filter((proxy: any) => proxy.type === "anytls")).toHaveLength(2);
    expect(JSON.parse(renderers["xray-json"].render(context).body).outbounds.filter((proxy: any) => proxy.protocol === "vless")).toHaveLength(2);
    const onlyAlternate = { ...context, methods: [alternate] };
    expect(() => renderers["xray-json"].render(onlyAlternate)).toThrow("No enabled");
    expect(YAML.parse(renderers.mihomo.render({ ...onlyAlternate, clientProfile: "mihomo-modern" }).body).proxies[0].port).toBe(2444);
  });


  test("restores the runtime snapshot if publishing the settings transaction fails", async () => {
    fixture.db.engines.recordInstallation("mihomo", engines.mihomo.version);
    const snapshots: number[] = [];
    const service = new ConnectionMethodService(fixture.db, async (_engine, methods) => { snapshots.push(methods.length); });
    const before = service.list();
    fixture.db.raw.exec("CREATE TRIGGER reject_method_publish BEFORE UPDATE ON settings WHEN NEW.key = 'connection_methods' BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END");
    await expect(service.save(method("mihomo"), "owner")).rejects.toThrow("fixture write failure");
    expect(snapshots).toEqual([4, 3]);
    expect(service.list()).toEqual(before);
  });

  test("health and firewall ports follow configured listeners and headless states", () => {
    const all = defaultMethods(engineIds);
    for (const id of engineIds) {
      const rendered = renderEngine(id, defaultEngineTemplates[id], [], []);
      expect(runtimePorts(id, rendered)).toEqual([]);
      expect(runtimePorts(id, rendered, true)).not.toContain("443/tcp");
    }
    const awg = all.find((method) => method.protocol === "amneziawg")!;
    awg.settings.port = 54445;
    expect(runtimePorts("amneziawg", renderEngine("amneziawg", defaultEngineTemplates.amneziawg, [], [awg]))).toEqual(["54445/udp"]);
  });
});
