import {defaultMethods} from "../src/shared/connection-methods";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { database } from "./helpers";
import { engineIds, engines } from "../src/shared/engines";
import { protocols } from "../src/shared/protocols";
import { config } from "../src/server/config";
import { ConnectionService } from "../src/server/services/connections";
import { ConnectionSyncService } from "../src/server/services/connection-sync";
import { EngineRuntimeService } from "../src/server/services/engine-runtime";
import { protocolCredential } from "../src/server/adapters/protocol-credentials";
import { amneziaClient, amneziaNative, amneziaPeer, publicKey } from "../src/server/adapters/amneziawg";
import { defaultEngineTemplates } from "../src/server/adapters/engine-presets";
import { renderEngine, validateTemplate } from "../src/server/adapters/engines";
import { mihomoRenderer, singBoxRenderer, type SubscriptionContext } from "../src/server/adapters/subscriptions";

const credential = { connectionId: "protocol-test", serial: 1, generation: 1,
  hysteria: { id: "protocol-test", password: "test-only-not-a-real-password" },
  xray: { id: "f8e5bb4d-483a-4f57-b2fe-cda0d799cb83", email: "test.1@outpost.local" } };
const identity = { privateKey: Buffer.alloc(32, 7).toString("base64"), headerProtectionKey: Buffer.alloc(32, 8).toString("base64") };

describe("additional protocol contracts", () => {
  test("separates passwords by protocol and rotates the entire credential family", () => {
    const values = ["anytls", "trusttunnel", "naive"].map((id) => protocolCredential(credential, id as "anytls").password);
    expect(new Set(values).size).toBe(3);
    expect(values).not.toContain(credential.hysteria.password);
    expect(protocolCredential(credential, "anytls").password).toBe(values[0]!);
    expect(protocolCredential({ ...credential, generation: 2 }, "anytls").password).not.toBe(values[0]!);
    expect(amneziaPeer({ ...credential, generation: 2 }).publicKey).not.toBe(amneziaPeer(credential).publicKey);
  });

  test("exports only this AWG peer and rejects injected native directives", () => {
    const peer = amneziaPeer(credential);
    const text = amneziaClient(credential, 1, "vpn.example", identity);
    expect(text).toContain(`PublicKey = ${publicKey(identity.privateKey)}`);
    expect(text).toContain(`PrivateKey = ${peer.privateKey}`);
    expect(text).not.toContain(identity.privateKey);
    expect(text).toContain("RandomTrailers = on");
    expect(text).toContain("DisableCookies = on");
    expect(text).toContain("AllowedIPs = 0.0.0.0/0, ::/0");
    expect(() => amneziaPeer(credential, 65533)).toThrow();
    const snapshot = { server: identity, peers: [{ publicKey: peer.publicKey, presharedKey: peer.presharedKey, address: peer.address }] };
    expect(amneziaNative(snapshot)).not.toContain(peer.privateKey);
    expect(() => amneziaNative({ ...snapshot, PostUp: "arbitrary command" })).toThrow();
    expect(() => amneziaNative({ ...snapshot, peers: [snapshot.peers[0], snapshot.peers[0]] })).toThrow();
  });

  test("keeps optional runtimes absent until installation and preserves installed versions across pin reconciliation", () => {
    const fixture = database();
    try {
      expect(fixture.db.engines.installed().sort()).toEqual(["hysteria", "xray"]);
      fixture.db.engines.recordInstallation("hysteria", "2.12.1");
      fixture.db.engines.reconcilePins();
      expect(fixture.db.engines.version("hysteria")).toMatchObject({ installed_version: "2.12.1", desired_version: engines.hysteria.version });
      expect(fixture.db.engines.services().find((service) => service.name === "outpost-mihomo")?.status).toBe("not-installed");
    } finally { fixture.close(); }
  });

  test("recovers actual installed versions from managed links after a database restore", () => {
    const fixture = database();
    try {
      const root = join(fixture.directory, "engines");
      const path = join(root, "mihomo", engines.mihomo.version);
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, "mihomo"), "fixture");
      symlinkSync(engines.mihomo.version, join(root, "mihomo", "current"));
      fixture.db.engines.recoverInstallations(root);
      expect(fixture.db.engines.version("mihomo")?.installed_version).toBe(engines.mihomo.version);
      expect(fixture.db.engines.installed()).toEqual(["mihomo"]);
    } finally { fixture.close(); }
  });

  test("protects managed listeners and never opens passwordless listeners", () => {
    for (const id of ["mihomo", "sing-box"] as const) {
      expect(validateTemplate(id, defaultEngineTemplates[id]).valid).toBeTrue();
      const empty = renderEngine(id, defaultEngineTemplates[id], []);
      expect(id === "mihomo" ? YAML.parse(empty).listeners : JSON.parse(empty).inbounds).toEqual([]);
      const rendered = renderEngine(id, defaultEngineTemplates[id], [credential]);
      expect(rendered).not.toContain("{{OUTPOST");
      expect(rendered).not.toContain(credential.hysteria.password);
    }
  });

  test("gates modern exports by server installation and explicit client capabilities", () => {
    const context = { connection: { id: "protocol-test", serial: 1, name: "Test", color: "blue", avatar: "avatar-person", status: "active", generation: 1, created_at: "", updated_at: "", activated_at: null, first_used_at: null, last_fetched_at: null, first_seen_at: null, last_seen_at: null, absence_notified_at: null, suspended_at: null, archived_at: null }, credentials: credential, routes: [], subscriptionToken: "test", engineOrder: engineIds } as SubscriptionContext;
    const legacy = YAML.parse(mihomoRenderer.render(context).body).proxies;
    expect(legacy.map((proxy: { type: string }) => proxy.type)).toEqual(["hysteria2", "vless", "vless"]);
    const modern = { ...context, enabledEngines: engineIds, protocols: Object.keys(protocols) as Array<keyof typeof protocols> };
    const proxies = YAML.parse(mihomoRenderer.render(modern).body).proxies;
    expect(proxies.map((proxy: { type: string }) => proxy.type)).toEqual(["hysteria2", "vless", "vless", "anytls", "trusttunnel", "wireguard"]);
    expect(proxies.find((proxy: { type: string }) => proxy.type === "trusttunnel")["skip-cert-verify"]).toBeFalse();
    const sing = JSON.parse(singBoxRenderer.render(modern).body);
    expect(sing.outbounds.find((outbound: { type: string }) => outbound.type === "naive").tls.server_name).toBe(config.domain);
    expect(sing.outbounds.find((outbound: { type: string }) => outbound.type === "urltest").outbounds).toEqual(["hysteria2", "vless-grpc", "anytls", "naive"]);
  });

  test("includes installed optional engines in create, suspension, rotation and archive", async () => {
    const fixture = database();
    const previousDemo = config.demo;
    try {
      (config as { demo: boolean }).demo = false;
      for (const id of ["mihomo", "sing-box", "amneziawg"] as const) fixture.db.engines.recordInstallation(id, engines[id].version);
      fixture.db.setSetting("connection_methods", defaultMethods(engineIds));
      const snapshots = new Map<string, string>();
      const recovery: Array<Record<string, unknown>> = [];
      const runtime = new EngineRuntimeService(fixture.db, async (request) => {
        if (request.action === "config.apply" && request.payload.restart === false) recovery.push(request.payload);
        if (request.action === "config.sync") snapshots.set(String(request.payload.engine), readFileSync(String(request.payload.source), "utf8"));
        return { ok: true };
      });
      const connections = new ConnectionService(fixture.db);
      const sync = new ConnectionSyncService(fixture.db, connections, runtime);
      const first = connections.create({ name: "First" });
      const second = connections.create({ name: "Second" });
      await Promise.all([sync.activate(first.id), sync.activate(second.id)]);
      expect(JSON.parse(snapshots.get("amneziawg")!).peers).toHaveLength(2);
      const old = connections.credentials(first.id);
      const password = protocolCredential(old, "anytls").password;
      expect(snapshots.get("mihomo")).toContain(password);
      await sync.suspend(first.id);
      expect(snapshots.get("mihomo")).not.toContain(password);
      expect(JSON.parse(snapshots.get("amneziawg")!).peers).toHaveLength(1);
      await sync.resume(first.id);
      await sync.rotate(first.id);
      expect(snapshots.get("mihomo")).not.toContain(password);
      expect(snapshots.get("mihomo")).toContain(protocolCredential(connections.credentials(first.id), "anytls").password);
      await sync.archive(first.id);
      expect(JSON.parse(snapshots.get("amneziawg")!).peers).toHaveLength(1);
      await runtime.prepareRecovery();
      expect(recovery).toHaveLength(5);
      expect(recovery.every((request) => request.restart === false)).toBeTrue();
    } finally { (config as { demo: boolean }).demo = previousDemo; fixture.close(); }
  });
});
