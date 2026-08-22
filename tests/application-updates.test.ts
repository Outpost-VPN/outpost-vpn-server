import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ApplicationUpdateService } from "../src/server/services/application-updates";
import { compareVersions, parseVersion } from "../src/server/releases";
import { database } from "./helpers";

const root = "https://github.com/Outpost-VPN/outpost-vpn-server/releases/download";
const index = "https://api.github.com/repos/Outpost-VPN/outpost-vpn-server/releases?per_page=100";

describe("application release versions", () => {
  test("orders release candidates and stable releases with SemVer precedence", () => {
    expect(compareVersions("0.1.0-rc.14", "0.1.0-rc.13")).toBe(1);
    expect(compareVersions("0.1.0", "0.1.0-rc.14")).toBe(1);
    expect(compareVersions("0.1.1-rc.1", "0.1.0")).toBe(1);
    expect(compareVersions("0.1.0-rc.2", "0.1.0-rc.10")).toBe(-1);
    expect(parseVersion("0.1.0-rc.01")).toBeNull();
    expect(parseVersion("v0.1.0")).toBeNull();
  });
});

describe("signed application update preparation", () => {
  let fixture: ReturnType<typeof database>;

  beforeEach(() => { fixture = database(); });
  afterEach(() => fixture.close());

  test("discovers the newest candidate and atomically prepares its exact signed assets", async () => {
    const archive = new TextEncoder().encode("signed archive");
    const signature = new TextEncoder().encode("trusted signature");
    const release = githubRelease("0.1.0-rc.14", true, archive.length, signature.length, "## What's Changed\n* Make updates reliable by @HeapVoid in https://github.com/Outpost-VPN/outpost-vpn-server/pull/14");
    const calls: string[] = [];
    const service = new ApplicationUpdateService(fixture.db, {
      current: "0.1.0-rc.13",
      dataDir: fixture.directory,
      fetch: mockFetch([release], archive, signature, calls),
      verify: async (bundle, minisig) => {
        expect(await Bun.file(bundle).text()).toBe("signed archive");
        expect(await Bun.file(minisig).text()).toBe("trusted signature");
      },
    });

    expect(await service.check()).toMatchObject({
      status: "available",
      channel: "candidate",
      latest: "0.1.0-rc.14",
      notes: ["Make updates reliable"],
    });
    const prepared = await service.prepare();

    expect(prepared).toMatchObject({ status: "ready", available: true, ready: true, latest: "0.1.0-rc.14", notes: ["Make updates reliable"] });
    expect(prepared.payload).toEqual({
      version: "0.1.0-rc.14",
      bundle: join(fixture.directory, "incoming", "outpost-0.1.0-rc.14-linux-amd64.tar.gz"),
      signature: join(fixture.directory, "incoming", "outpost-0.1.0-rc.14-linux-amd64.tar.gz.minisig"),
    });
    expect(await Bun.file(prepared.payload.bundle).text()).toBe("signed archive");
    expect(await Bun.file(prepared.payload.signature).text()).toBe("trusted signature");
    expect(calls).toEqual([index, release.assets[0]!.browser_download_url, release.assets[1]!.browser_download_url]);
  });

  test("stable channel ignores prereleases", async () => {
    fixture.db.setSetting("system", { timezone: "UTC", updateChannel: "stable" });
    fixture.db.setSetting("update_channel_v2", true);
    const candidate = githubRelease("0.1.1-rc.1", true, 10, 10);
    const service = new ApplicationUpdateService(fixture.db, {
      current: "0.1.0",
      dataDir: fixture.directory,
      fetch: (async () => Response.json([candidate])) as unknown as typeof globalThis.fetch,
      verify: async () => undefined,
    });

    expect(await service.check()).toMatchObject({ status: "current", channel: "stable", available: false, latest: "0.1.0" });
  });

  test("rejects release metadata that points outside the fixed GitHub download path", async () => {
    const release = githubRelease("0.1.0-rc.14", true, 10, 10);
    release.assets[0]!.browser_download_url = "https://updates.example.test/outpost.tar.gz";
    const service = new ApplicationUpdateService(fixture.db, {
      current: "0.1.0-rc.13",
      dataDir: fixture.directory,
      fetch: (async () => Response.json([release])) as unknown as typeof globalThis.fetch,
      verify: async () => undefined,
    });

    expect(await service.check()).toMatchObject({ status: "current", available: false });
  });

  test("does not publish downloaded files when Minisign verification fails", async () => {
    const archive = new TextEncoder().encode("tampered archive");
    const signature = new TextEncoder().encode("invalid signature");
    const release = githubRelease("0.1.0-rc.14", true, archive.length, signature.length);
    const service = new ApplicationUpdateService(fixture.db, {
      current: "0.1.0-rc.13",
      dataDir: fixture.directory,
      fetch: mockFetch([release], archive, signature, []),
      verify: async () => { throw new Error("signature rejected"); },
    });

    await service.check();
    await expect(service.prepare()).rejects.toThrow("Не удалось подготовить обновление");
    expect(await Bun.file(join(fixture.directory, "incoming", release.assets[0]!.name)).exists()).toBeFalse();
    expect(service.state()).toMatchObject({ status: "failed", ready: false, error: "signature rejected" });
  });
});

function githubRelease(version: string, prerelease: boolean, archiveSize: number, signatureSize: number, body: string | null = null) {
  const tag = `v${version}`;
  const archive = `outpost-${version}-linux-amd64.tar.gz`;
  return {
    tag_name: tag,
    draft: false,
    prerelease,
    published_at: "2026-08-22T00:00:00Z",
    body,
    assets: [
      { name: archive, size: archiveSize, browser_download_url: `${root}/${tag}/${archive}` },
      { name: `${archive}.minisig`, size: signatureSize, browser_download_url: `${root}/${tag}/${archive}.minisig` },
    ],
  };
}

function mockFetch(releases: unknown[], archive: Uint8Array, signature: Uint8Array, calls: string[]): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === index) return Response.json(releases);
    if (url.endsWith(".minisig")) return new Response(bytes(signature));
    return new Response(bytes(archive));
  }) as typeof globalThis.fetch;
}

function bytes(value: Uint8Array) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
