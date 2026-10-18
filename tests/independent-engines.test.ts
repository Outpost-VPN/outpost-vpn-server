import {test, expect} from "bun:test";
import {EngineReleases, type ReleaseFetch} from "../src/server/adapters/engine-releases";
import {engines, type EngineId} from "../src/shared/engines";
import {OperationService} from "../src/server/services/operations";
import {database} from "./helpers";

const checksum = "a".repeat(64);
function release(engine: EngineId, version: string) {
  const definition = engines[engine];
  const tag = engine === "amneziawg" ? `engine-amneziawg-v${version}` : definition.tag.replace(definition.version,version);
  const name = engine === "amneziawg" ? `outpost-engine-amneziawg-${version}-linux-amd64.tar.gz` : definition.asset.replaceAll(definition.version,version);
  const repository = engine === "amneziawg" ? "Outpost-VPN/outpost-vpn-server" : definition.repository;
  const url = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${name}`;
  return {tag_name:tag, draft:false, prerelease:false, assets:[{name,digest:`sha256:${checksum}`,browser_download_url:url}, {name:`${name}.minisig`,browser_download_url:`${url}.minisig`}]};
}

test("independent candidates survive startup, require exact confirmation and do not modify installed versions", async () => {
  const fixture = database();
  try {
    const calls: string[] = [];
    const metadata = release("mihomo","1.20.0");
    const fetcher: ReleaseFetch = async (url) => {calls.push(url); return Response.json([metadata]);};
    fixture.db.setSetting("engine_release_checks", {hysteria:{checkedAt:1,latest:"2.13.0",url:null,artifact:null,error:null}});
    fixture.db.engines.recordInstallation("mihomo","1.19.32");
    await fixture.db.engines.checkReleases("test",fetcher,"mihomo");
    expect(calls).toHaveLength(1);
    expect(fixture.db.engines.releaseChecks().hysteria?.checkedAt).toBe(1);
    expect(fixture.db.engines.version("mihomo")).toMatchObject({installed_version:"1.19.32",desired_version:"1.20.0",checksum,updateAvailable:true});
    fixture.db.engines.reconcilePins();
    expect(fixture.db.engines.version("mihomo")?.desired_version).toBe("1.20.0");
    const operations = new OperationService(fixture.db);
    const payload = {engine:"mihomo",version:"1.20.0",checksum};
    const preview = operations.preview("engine.update",payload);
    expect(preview.action).toBe("engine.update");
    expect(() => operations.preview("engine.update",{...payload,checksum:"b".repeat(64)})).toThrow("доступным обновлением");
    expect(() => operations.confirm(preview.confirmationId,"engine.update",{...payload,version:"1.21.0"})).toThrow("не соответствует");
    fixture.db.engines.recordInstallation("mihomo","1.21.0");
    expect(fixture.db.engines.version("mihomo")?.updateAvailable).toBeFalse();
    expect(() => operations.preview("engine.update",payload)).toThrow("более новую версию движка");
  } finally {fixture.close();}
});

test("privileged resolution reconstructs known official assets and rejects substituted metadata", async () => {
  for (const engine of ["hysteria","xray","mihomo","sing-box"] as const) {
    const version = engine === "hysteria" ? "2.14.0" : engine === "xray" ? "26.11.1" : engine === "mihomo" ? "1.20.0" : "1.14.4";
    const metadata = release(engine,version);
    if (engine === "hysteria") metadata.assets[0]!.browser_download_url = metadata.assets[0]!.browser_download_url.replace("app%2F", "app/");
    const catalog = new EngineReleases(async (url) => {expect(url).toContain(`/repos/${engines[engine].repository}/releases/tags/`); return Response.json(metadata);});
    expect(await catalog.resolve(engine,version)).toMatchObject({version,checksum});
    for (const bad of [
      {...metadata,tag_name:"v0.0.0"}, {...metadata,draft:true},
      {...metadata,assets:[{...metadata.assets[0],browser_download_url:"https://evil.example/runtime"}]},
      {...metadata,assets:[{...metadata.assets[0],digest:null}]},
    ]) await expect(new EngineReleases(async () => Response.json(bad)).resolve(engine,version)).rejects.toThrow();
  }
  await expect(new EngineReleases().resolve("mihomo","../../etc/passwd")).rejects.toThrow("Invalid engine version");
});

test("AWG standalone bundles require their own signed asset and report a missing build without a panel requirement", async () => {
  const version = "3.1.20260901";
  const metadata = release("amneziawg",version);
  const catalog = new EngineReleases(async (url) => Response.json(url.includes("/tags?") ? [{name:`v${version}`}] : metadata));
  const artifact = await catalog.resolve("amneziawg",version);
  expect(artifact.archive).toBe("tar.gz");
  expect(artifact.signatureUrl).toBe(`${artifact.url}.minisig`);
  expect((await catalog.latest("amneziawg")).artifact?.version).toBe(version);
  const unsigned = {...metadata,assets:[metadata.assets[0]]};
  await expect(new EngineReleases(async () => Response.json(unsigned)).resolve("amneziawg",version)).rejects.toThrow("Signed runtime bundle");
  const pending = await new EngineReleases(async (url) => url.includes("/tags?") ? Response.json([{name:`v${version}`}]) : new Response("missing",{status:404})).latest("amneziawg");
  expect(pending).toMatchObject({latest:version,pending:"bundle",artifact:null,error:null});
});
