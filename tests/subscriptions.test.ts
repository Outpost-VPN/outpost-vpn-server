import { describe, expect, test } from "bun:test";
import YAML from "yaml";
import { incyAdapter, mihomoAdapter } from "../src/server/adapters/clients";
import type { ClientRenderContext } from "../src/server/adapters/clients";

const context: ClientRenderContext = {
  device: {
    id: "device", person_id: "person", person_name: "Мама", name: "iPhone", kind: "phone", platform: "ios", client: "incy",
    status: "active", created_at: "", updated_at: "", activated_at: "", first_seen_at: "", last_seen_at: "",
    profile_fetched_at: "", last_routes_version: null, absence_notified_at: null, revoked_at: null,
  },
  credentials: {
    deviceId: "device",
    hysteria: { id: "device", password: "hysteria-secret" },
    xray: { id: "f8e5bb4d-483a-4f57-b2fe-cda0d799cb83", email: "device@matreshka.local" },
  },
  routes: [
    { id: "1", position: 0, action: "DIRECT", matcher: "IP_CIDR", value: "10.0.0.0/8", source: "system", locked: true, enabled: true, created_at: "", updated_at: "" },
    { id: "2", position: 1, action: "PROXY", matcher: "SUFFIX", value: "*", source: "system", locked: true, enabled: true, created_at: "", updated_at: "" },
  ],
  subscriptionToken: "subscription-secret",
  engineOrder: ["hysteria", "xray"],
};

describe("client adapters", () => {
  test("INCY receives both endpoints and version-stable routing URL", () => {
    const output = incyAdapter.renderSubscription(context);
    expect(output.body).toContain("hysteria2://");
    expect(output.body).toContain("vless://");
    expect(output.headers.autorouting).toContain("/routes/subscription-secret.json");
    expect(output.headers["fragmentation-enable"]).toBe("1");
    expect(output.headers["no-limit-enabled"]).toBe("1");
    expect(output.headers["profile-title"]).toStartWith("base64:");
    expect(incyAdapter.renderDeepLink("https://example.test/sub")).toBe("incy://import/https://example.test/sub");
  });

  test("INCY routing uses the documented profile schema", () => {
    const profile = JSON.parse(incyAdapter.renderRoutes(context.routes).body);
    expect(profile.GlobalProxy).toBe("true");
    expect(profile.DirectSites).toEqual([]);
    expect(profile.DirectIp).toContain("10.0.0.0/8");
    expect(profile.ProxySites).toEqual([]);
    expect(profile.DomesticDNSDomain).toBe("https://cloudflare-dns.com/dns-query");
  });

  test("Mihomo profile contains both engines, DNS and final MATCH", () => {
    const output = mihomoAdapter.renderSubscription(context);
    const profile = YAML.parse(output.body);
    expect(profile.proxies.map((proxy: { type: string }) => proxy.type)).toEqual(["hysteria2", "vless"]);
    expect(profile.dns.enable).toBeTrue();
    expect(profile.rules.at(-1)).toBe("MATCH,PROXY");
  });

  test("both clients follow the configured engine priority", () => {
    const reversed = { ...context, engineOrder: ["xray", "hysteria"] as const };
    const incy = incyAdapter.renderSubscription(reversed).body.trim().split("\n");
    expect(incy[0]).toStartWith("vless://");
    expect(incy[1]).toStartWith("hysteria2://");

    const mihomo = YAML.parse(mihomoAdapter.renderSubscription(reversed).body);
    expect(mihomo.proxies.map((proxy: { type: string }) => proxy.type)).toEqual(["vless", "hysteria2"]);
    expect(mihomo["proxy-groups"][0].proxies).toEqual(["VLESS XHTTP", "Hysteria 2"]);
  });
});
