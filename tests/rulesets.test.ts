import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../src/server/config";
import type { RouteRule } from "../src/server/models";
import { RuleSetService } from "../src/server/services/rulesets";
import { database } from "./helpers";

const original = { rulesetDir: config.rulesetDir, rulesetIndex: config.rulesetIndex };
const mutableConfig = config as unknown as { rulesetDir: string; rulesetIndex: string };
const directories: string[] = [];

afterEach(() => {
  mutableConfig.rulesetDir = original.rulesetDir;
  mutableConfig.rulesetIndex = original.rulesetIndex;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("signed rule-set updates", () => {
  test("installs a checked bundle and rejects unknown published codes", async () => {
    const setup = fixture();
    try {
      const bundle = archive(setup.root, "bundle-v1", { geosite: ["google"], geoip: ["cn"] });
      const manifest = manifestFor("v1", bundle, { geosite: ["google"], geoip: ["cn"] });
      const service = serviceFor(setup.db.db, () => manifest, () => bundle.bytes);

      const state = await service.refresh(true);

      expect(state).toMatchObject({ status: "ready", activeVersion: "v1", lastError: null });
      expect(service.file("geosite", "google.srs").etag).toMatch(/^"[a-f0-9]{64}"$/);
      expect(() => service.assert([geoRule("GEOSITE", "google")])).not.toThrow();
      expect(() => service.assert([geoRule("GEOIP", "us")])).toThrow("нет указанных");
      expect(readFileSync(join(setup.rules, "v1", "geosite", "google.srs"), "utf8")).toContain("google");
    } finally {
      setup.db.close();
    }
  });

  test("signature and checksum failures retain the previous working version", async () => {
    const setup = fixture();
    let verifyError: Error | null = null;
    let currentBundle = archive(setup.root, "bundle-v1", { geosite: ["google"], geoip: ["cn"] });
    let currentManifest = manifestFor("v1", currentBundle, { geosite: ["google"], geoip: ["cn"] });
    const service = serviceFor(setup.db.db, () => currentManifest, () => currentBundle.bytes, async () => {
      if (verifyError) throw verifyError;
    });
    try {
      expect((await service.refresh(true)).activeVersion).toBe("v1");

      verifyError = new Error("Подпись индекса наборов недействительна");
      currentManifest = { ...currentManifest, version: "v2" };
      const signatureFailure = await service.refresh(true);
      expect(signatureFailure).toMatchObject({ status: "ready", activeVersion: "v1", lastError: "Подпись индекса наборов недействительна" });

      verifyError = null;
      currentManifest = { ...currentManifest, bundle: { ...currentManifest.bundle, sha256: "0".repeat(64) } };
      const checksumFailure = await service.refresh(true);
      expect(checksumFailure).toMatchObject({ status: "ready", activeVersion: "v1", lastError: "Checksum архива наборов не совпал" });

      currentBundle = archive(setup.root, "bundle-v3", { geosite: ["google"], geoip: ["cn"] }, true);
      currentManifest = manifestFor("v3", currentBundle, { geosite: ["google"], geoip: ["cn"] });
      const structureFailure = await service.refresh(true);
      expect(structureFailure).toMatchObject({ status: "ready", activeVersion: "v1", lastError: "Некорректная структура SRS для geosite:google" });
      expect(existsSync(join(setup.rules, "v1", "geoip", "cn.srs"))).toBeTrue();
      expect(setup.db.db.setting<{ activeVersion: string }>("rulesets", { activeVersion: "" }).activeVersion).toBe("v1");
    } finally {
      setup.db.close();
    }
  });

  test("keeps the active version and two previous bundles", async () => {
    const setup = fixture();
    let currentBundle = archive(setup.root, "bundle-v1", { geosite: ["google"], geoip: ["cn"] });
    let currentManifest = manifestFor("v1", currentBundle, { geosite: ["google"], geoip: ["cn"] });
    const service = serviceFor(setup.db.db, () => currentManifest, () => currentBundle.bytes);
    try {
      for (const version of ["v1", "v2", "v3", "v4"]) {
        currentBundle = archive(setup.root, `bundle-${version}`, { geosite: ["google"], geoip: ["cn"] });
        currentManifest = manifestFor(version, currentBundle, { geosite: ["google"], geoip: ["cn"] });
        expect((await service.refresh(true)).activeVersion).toBe(version);
      }
      expect(readdirSync(setup.rules).filter((name) => !name.startsWith(".")).sort()).toEqual(["v2", "v3", "v4"]);
    } finally {
      setup.db.close();
    }
  });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "outpost-rulesets-"));
  directories.push(root);
  const rules = join(root, "installed");
  mutableConfig.rulesetDir = rules;
  mutableConfig.rulesetIndex = "https://updates.example.test/rulesets.json";
  return { root, rules, db: database() };
}

function archive(root: string, name: string, codes: { geosite: string[]; geoip: string[] }, corrupt = false) {
  const source = join(root, name);
  for (const family of ["geosite", "geoip"] as const) {
    mkdirSync(join(source, family), { recursive: true });
    for (const code of codes[family]) {
      const payload = corrupt && family === "geosite"
        ? Buffer.from(`BAD:${family}:${code}`)
        : Buffer.concat([Buffer.from([0x53, 0x52, 0x53, 0x01]), Buffer.from(`${family}:${code}`)]);
      writeFileSync(join(source, family, `${code}.srs`), payload);
    }
  }
  const path = join(root, `${name}.tar.gz`);
  const process = Bun.spawnSync(["tar", "-czf", path, "-C", source, "geosite", "geoip"]);
  if (process.exitCode !== 0) throw new Error(process.stderr.toString());
  const bytes = readFileSync(path);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function manifestFor(version: string, bundle: { sha256: string }, codes: { geosite: string[]; geoip: string[] }) {
  return {
    version,
    bundle: { url: `https://updates.example.test/rulesets-${version}.tar.gz`, sha256: bundle.sha256 },
    codes,
  };
}

function serviceFor(
  db: ReturnType<typeof database>["db"],
  manifest: () => ReturnType<typeof manifestFor>,
  bundle: () => Uint8Array,
  verify: (manifestPath: string, signaturePath: string) => Promise<void> = async () => {},
) {
  return new RuleSetService(db, undefined, {
    verify,
    fetch: (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("rulesets.json")) return Response.json(manifest());
      if (url.endsWith(".minisig")) return new Response("signature");
      if (url.endsWith(".tar.gz")) return new Response(bundle().slice().buffer as ArrayBuffer);
      return new Response("not found", { status: 404 });
    }) as typeof fetch,
  });
}

function geoRule(matcher: "GEOSITE" | "GEOIP", value: string): RouteRule {
  return { id: crypto.randomUUID(), position: 0, action: "PROXY", matcher, value, source: "user", locked: false, enabled: true, created_at: "", updated_at: "" };
}
