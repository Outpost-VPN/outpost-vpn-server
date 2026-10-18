import {test, expect} from "bun:test";
import {database} from "./helpers";
import {engineIds, engines, engineTracksTraffic} from "../src/shared/engines";
import {methodClientProfiles, defaultMethods} from "../src/shared/connection-methods";
import {advanced} from "../src/server/adapters/catalog";

const release = (tag_name: string, prerelease = false, draft = false) => ({tag_name, prerelease, draft});

test("official release discovery preserves installable pins, separates products and respects channels", async () => {
  const fixture = database();
  try {
    const before = fixture.db.engines.versions();
    let calls = 0;
    const fetcher = (async (input: string | URL | Request) => {
      calls++;
      const url = String(input);
      const id = engineIds.find((id) => url.includes(engines[id].repository))!;
      const tags = id === "hysteria" ? [release("v99.0.0"), release("app/v2.14.0"), release("app/v2.15.0-beta.1", true)]
        : id === "xray" ? [release("v27.1.1", true), release("v26.10.17")]
        : id === "mihomo" ? [release("v1.9.9"), release("v1.20.0"), release("v9.0.0", true), release("v10.0.0", false, true)]
        : id === "amneziawg" ? [{name: engines[id].tag}] : [release(engines[id].tag)];
      return Response.json(tags);
    });
    const [checks, same] = await Promise.all([fixture.db.engines.checkReleases("test", fetcher), fixture.db.engines.checkReleases("test", fetcher)]);
    expect(calls).toBe(5);
    expect(same).toEqual(checks);
    expect(checks.hysteria?.latest).toBe("2.14.0");
    expect(checks.xray?.latest).toBe("27.1.1");
    expect(checks.mihomo?.latest).toBe("1.20.0");
    expect(checks.mihomo?.newerThanPin).toBeTrue();
    expect(checks.amneziawg?.latest).toBe(engines.amneziawg.version);
    expect(checks.amneziawg?.url).toBe("https://github.com/amnezia-vpn/amneziawg-go/tree/v3.1.20260828");
    expect(checks.mihomo?.newerThanInstalled).toBeFalse();
    expect(checks.hysteria?.url).toBe("https://github.com/HyNetworks/hysteria/releases/tag/app%2Fv2.14.0");
    expect(fixture.db.engines.versions()).toEqual(before);
    fixture.db.engines.recordInstallation("mihomo", "1.19.32");
    expect(fixture.db.engines.releaseChecks().mihomo?.newerThanInstalled).toBeTrue();
    expect(fixture.db.engines.releaseChecks().hysteria?.checkedAt).toBeNumber();
  } finally {fixture.close();}
});

test("partial release-check failures are explicit and retryable without changing versions", async () => {
  const fixture = database();
  try {
    const before = fixture.db.engines.versions();
    const checks = await fixture.db.engines.checkReleases("test", (async (input) => String(input).includes("MetaCubeX")
      ? Response.json([release("v1.19.32")]) : new Response("rate limit", {status:403})));
    expect(checks.mihomo?.error).toBeNull();
    expect(checks.hysteria?.error).toBe("unavailable");
    expect(checks.hysteria?.latest).toBeNull();
    const retried = await fixture.db.engines.checkReleases("test", (async () => Response.json([release("v2.13.0"), release("app/v2.13.0")])));
    expect(retried.hysteria?.error).toBeNull();
    expect(fixture.db.engines.versions()).toEqual(before);
  } finally {fixture.close();}
});

test("method guidance follows protocol compatibility and engine telemetry independently", () => {
  const anytls = {...defaultMethods(["mihomo"])[0]!, engine:"sing-box" as const};
  expect(anytls.protocol).toBe("anytls");
  expect(methodClientProfiles(anytls).map((profile) => profile.id)).toEqual(["mihomo-modern", "sing-box-modern"]);
  expect(methodClientProfiles(anytls).find((profile) => profile.id === "sing-box-modern")?.minimumCore).not.toContain("Cronet");
  expect(methodClientProfiles({...anytls, protocol:"naive"}).find((profile) => profile.id === "sing-box-modern")?.minimumCore).toContain("Cronet");
  expect(advanced("https://example.test/s/test", "en", {methods:[anytls], installed:["sing-box"]}).find((profile) => profile.id === "sing-box-modern")?.description).not.toContain("Cronet");
  expect(methodClientProfiles(defaultMethods(["hysteria"])[0]!).some((profile) => !profile.minimumCore)).toBeTrue();
  expect(engineTracksTraffic("hysteria")).toBeTrue();
  expect(engineTracksTraffic("xray")).toBeTrue();
  expect(engineTracksTraffic("sing-box")).toBeFalse();
  expect(engineTracksTraffic("mihomo")).toBeFalse();
});
