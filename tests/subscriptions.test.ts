import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import YAML from "yaml";
import {
  linksRenderer,
  mihomoRenderer,
  renderLinkRoutes,
  singBoxRenderer,
  xrayJsonRenderer,
  xrayRenderer,
  type SubscriptionContext,
} from "../src/server/adapters/subscriptions";

const context: SubscriptionContext = {
  connection: {
    id: "access", serial: 1, name: "iPhone", color: "blue", avatar: "avatar-person",
    status: "active", generation: 1, created_at: "", updated_at: "", activated_at: "", first_used_at: null, last_fetched_at: null,
    first_seen_at: null, last_seen_at: null, absence_notified_at: null, archived_at: null,
  },
  credentials: {
    connectionId: "access",
    generation: 1,
    hysteria: { id: "access", password: "hysteria-secret" },
    xray: { id: "f8e5bb4d-483a-4f57-b2fe-cda0d799cb83", email: "access@outpost.local" },
  },
  routes: [
    { id: "1", position: 0, action: "DIRECT", matcher: "IP_CIDR", value: "10.0.0.0/8", source: "system", locked: true, enabled: true, created_at: "", updated_at: "" },
    { id: "2", position: 1, action: "PROXY", matcher: "GEOSITE", value: "google", source: "user", locked: false, enabled: true, created_at: "", updated_at: "" },
    { id: "3", position: 2, action: "PROXY", matcher: "SUFFIX", value: "*", source: "system", locked: true, enabled: true, created_at: "", updated_at: "" },
  ],
  subscriptionToken: "subscription-secret",
  engineOrder: ["hysteria", "xray"],
  clientPlatform: "ios",
};

describe("technology subscription renderers", () => {
  test("five formats match their golden SHA-256 fingerprints", () => {
    const expected = {
      links: "ee90de33a4c5b6b1f8b62830c05dc51f33e19c045d417230974eee89648ed336",
      mihomo: "46aee42098f92e861b0ae11807ef33797a51c8381a937316deed648bb892a625",
      "sing-box": "4c79e63f6db7b7388862bc19df3acba987d0fa299a6264ec8f2db2c8033be47e",
      xray: "4acd88ef98861fed276fc4716ab1f1cbd3cba56134e6a4acf4c4a59619a69b16",
      "xray-json": "ffc86874cf27c00cb9c47f4aee7fd52b6debcce8a457000cd49f787d024928a8",
    };
    const rendered = [linksRenderer, mihomoRenderer, singBoxRenderer, xrayRenderer, xrayJsonRenderer];
    for (const renderer of rendered) {
      const digest = createHash("sha256").update(renderer.render(context).body).digest("hex");
      expect(digest, `${renderer.id} golden profile`).toBe(expected[renderer.id]);
    }
  });

  test("links includes Hysteria, XHTTP and gRPC plus INCY-compatible headers", () => {
    const output = linksRenderer.render(context);
    const links = output.body.trim().split("\n");
    expect(links[0]).toStartWith("hysteria2://");
    expect(links[1]).toContain("type=xhttp");
    expect(links[1]).toContain("mode=packet-up");
    expect(links[2]).toContain("type=grpc");
    expect(output.headers.autorouting).toContain("/s/subscription-secret/routes");
    expect(output.headers["fragmentation-enable"]).toBe("1");
    expect(output.headers["no-limit-enabled"]).toBe("1");
    expect(output.headers["cache-control"]).toContain("no-store");
  });

  test("link routes keep the documented INCY routing schema", () => {
    const profile = JSON.parse(renderLinkRoutes(context.routes).body);
    expect(profile.GlobalProxy).toBe("true");
    expect(profile.DirectIp).toContain("10.0.0.0/8");
    expect(profile.ProxySites).toContain("geosite:google");
  });

  test("Mihomo has Hysteria, XHTTP and gRPC in fallback order", () => {
    const profile = YAML.parse(mihomoRenderer.render(context).body);
    expect(profile.proxies.map((proxy: { name: string }) => proxy.name)).toEqual(["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"]);
    expect(profile["proxy-groups"][0]).toMatchObject({ type: "fallback", proxies: ["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"] });
    expect(profile.proxies[1]["xhttp-opts"].mode).toBe("packet-up");
    expect(profile.dns.enable).toBeTrue();
    expect(profile.rules.at(-1)).toBe("MATCH,PROXY");
  });

  test("sing-box uses Hysteria and gRPC with urltest and remote SRS rules", () => {
    const profile = JSON.parse(singBoxRenderer.render(context).body);
    expect(profile.outbounds.slice(0, 3).map((outbound: { type: string }) => outbound.type)).toEqual(["hysteria2", "vless", "urltest"]);
    expect(profile.outbounds[1].transport).toMatchObject({ type: "grpc" });
    expect(profile.outbounds[2].outbounds).toEqual(["hysteria2", "vless-grpc"]);
    expect(profile.route.rule_set[0].url).toContain("/rulesets/geosite/google.srs");
    expect(profile.route.final).toBe("proxy");
  });

  test("Xray URI is base64 of both VLESS fallbacks", () => {
    const decoded = Buffer.from(xrayRenderer.render(context).body, "base64").toString("utf8").trim().split("\n");
    expect(decoded).toHaveLength(2);
    expect(decoded[0]).toContain("type=xhttp");
    expect(decoded[1]).toContain("type=grpc");
  });

  test("full Xray JSON has both outbounds, observatory and balancer", () => {
    const profile = JSON.parse(xrayJsonRenderer.render(context).body);
    expect(profile.outbounds.slice(0, 2).map((outbound: { tag: string }) => outbound.tag)).toEqual(["proxy-xhttp", "proxy-grpc"]);
    expect(profile.outbounds[0].streamSettings.xhttpSettings.mode).toBe("packet-up");
    expect(profile.observatory.subjectSelector).toEqual(["proxy-"]);
    expect(profile.routing.balancers[0]).toMatchObject({ tag: "proxy", selector: ["proxy-"] });
  });

  test("configured engine priority affects only formats with both technologies", () => {
    const reversed = { ...context, engineOrder: ["xray", "hysteria"] as const };
    expect(linksRenderer.render(reversed).body.trim().split("\n")[0]).toContain("type=xhttp");
    const mihomo = YAML.parse(mihomoRenderer.render(reversed).body);
    expect(mihomo.proxies.map((proxy: { name: string }) => proxy.name)).toEqual(["VLESS XHTTP", "VLESS gRPC", "Hysteria 2"]);
    const singBox = JSON.parse(singBoxRenderer.render(reversed).body);
    expect(singBox.outbounds[2].outbounds).toEqual(["vless-grpc", "hysteria2"]);
  });
});
