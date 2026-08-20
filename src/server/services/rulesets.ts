import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { OutpostDatabase } from "../db/database";
import { now } from "../db/database";
import { config } from "../config";
import type { RouteRule } from "../models";
import { JournalService } from "./journal";
import { ServiceError } from "./connections";

type Family = "geosite" | "geoip";
type RulesetManifest = {
  version: string;
  bundle: { url: string; sha256: string };
  codes: Record<Family, string[]>;
  source?: { geosite?: string; geoip?: string };
};

type RulesetState = {
  status: "idle" | "ready" | "error";
  activeVersion: string | null;
  checkedAt: string | null;
  updatedAt: string | null;
  lastError: string | null;
  codes: Record<Family, string[]>;
};

type RuleSetDependencies = {
  fetch?: typeof globalThis.fetch;
  verify?: (manifestPath: string, signaturePath: string) => Promise<void>;
};

const emptyState: RulesetState = {
  status: "idle",
  activeVersion: null,
  checkedAt: null,
  updatedAt: null,
  lastError: null,
  codes: { geosite: [], geoip: [] },
};

export class RuleSetService {
  private journal: JournalService;
  private refreshing: Promise<RulesetState> | null = null;
  private fetcher: typeof globalThis.fetch;
  private verify: (manifestPath: string, signaturePath: string) => Promise<void>;

  constructor(private db: OutpostDatabase, journal?: JournalService, dependencies: RuleSetDependencies = {}) {
    this.journal = journal ?? new JournalService(db);
    this.fetcher = dependencies.fetch ?? globalThis.fetch;
    this.verify = dependencies.verify ?? ((manifestPath, signaturePath) => command(
      ["minisign", "-Vm", manifestPath, "-x", signaturePath, "-P", config.rulesetPublicKey],
      "Подпись индекса наборов недействительна",
    ).then(() => undefined));
    mkdirSync(config.rulesetDir, { recursive: true, mode: 0o700 });
  }

  state() {
    return this.db.setting<RulesetState>("rulesets", emptyState);
  }

  version(rules: RouteRule[]) {
    return this.required(rules).length ? this.state().activeVersion : null;
  }

  assert(rules: RouteRule[]) {
    const required = this.required(rules);
    if (!required.length) return;
    const state = this.state();
    if (state.status !== "ready" || !state.activeVersion) {
      throw new ServiceError(409, "GeoIP/Geosite-наборы ещё не готовы", { reason: state.lastError });
    }
    const missing = required.filter(({ family, code }) => !state.codes[family].includes(code));
    if (missing.length) {
      throw new ServiceError(400, "В текущем наборе нет указанных GeoIP/Geosite-кодов", { missing });
    }
  }

  file(family: string, rawCode: string) {
    if (family !== "geosite" && family !== "geoip") throw new ServiceError(404, "Набор правил не найден");
    const code = normalizeCode(rawCode.replace(/\.srs$/, ""));
    const state = this.state();
    if (state.status !== "ready" || !state.activeVersion || !state.codes[family].includes(code)) {
      throw new ServiceError(404, "Набор правил не найден");
    }
    const path = join(config.rulesetDir, state.activeVersion, family, `${code}.srs`);
    if (!existsSync(path) || !statSync(path).isFile()) throw new ServiceError(404, "Набор правил не найден");
    const etag = `"${createHash("sha256").update(readFileSync(path)).digest("hex")}"`;
    return { file: Bun.file(path), etag, version: state.activeVersion };
  }

  async refresh(force = false) {
    if (this.refreshing) return this.refreshing;
    const current = this.state();
    if (!force && current.checkedAt && Date.now() - Date.parse(current.checkedAt) < config.rulesetCheckHours * 60 * 60 * 1000) {
      return current;
    }
    this.refreshing = this.update().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async update() {
    const checkedAt = now();
    const incoming = join(config.rulesetDir, `.incoming-${crypto.randomUUID()}`);
    mkdirSync(incoming, { recursive: true, mode: 0o700 });
    try {
      const [manifestResponse, signatureResponse] = await Promise.all([
        this.fetcher(config.rulesetIndex, { signal: AbortSignal.timeout(20_000) }),
        this.fetcher(`${config.rulesetIndex}.minisig`, { signal: AbortSignal.timeout(20_000) }),
      ]);
      if (!manifestResponse.ok || !signatureResponse.ok) throw new Error("Индекс наборов недоступен");
      const manifestPath = join(incoming, "rulesets.json");
      const signaturePath = join(incoming, "rulesets.json.minisig");
      writeFileSync(manifestPath, new Uint8Array(await manifestResponse.arrayBuffer()), { mode: 0o600 });
      writeFileSync(signaturePath, new Uint8Array(await signatureResponse.arrayBuffer()), { mode: 0o600 });
      await this.verify(manifestPath, signaturePath);

      const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
      const current = this.state();
      if (current.activeVersion === manifest.version && this.complete(manifest)) {
        const state = { ...current, status: "ready" as const, checkedAt, lastError: null };
        this.db.setSetting("rulesets", state);
        return state;
      }

      const bundleResponse = await this.fetcher(manifest.bundle.url, { signal: AbortSignal.timeout(120_000) });
      if (!bundleResponse.ok) throw new Error("Архив наборов недоступен");
      const bundlePath = join(incoming, basename(new URL(manifest.bundle.url).pathname) || "rulesets.tar.gz");
      writeFileSync(bundlePath, new Uint8Array(await bundleResponse.arrayBuffer()), { mode: 0o600 });
      if (sha256(bundlePath) !== manifest.bundle.sha256) throw new Error("Checksum архива наборов не совпал");

      const entries = (await command(["tar", "-tzf", bundlePath], "Архив наборов повреждён")).split("\n").filter(Boolean);
      if (!entries.length || entries.some(unsafeEntry)) throw new Error("Архив наборов содержит небезопасные пути");
      const staged = join(incoming, "unpacked");
      mkdirSync(staged, { mode: 0o700 });
      await command(["tar", "-xzf", bundlePath, "-C", staged, "--no-same-owner", "--no-same-permissions"], "Не удалось распаковать наборы");
      validateFiles(staged, manifest);
      writeFileSync(join(staged, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });

      const target = join(config.rulesetDir, manifest.version);
      if (existsSync(target)) rmSync(target, { recursive: true, force: true });
      renameSync(staged, target);
      const state: RulesetState = {
        status: "ready",
        activeVersion: manifest.version,
        checkedAt,
        updatedAt: checkedAt,
        lastError: null,
        codes: manifest.codes,
      };
      this.db.setSetting("rulesets", state);
      this.cleanup(manifest.version);
      this.journal.record("rulesets.updated", {
        actor: "ruleset-updater",
        source: "rulesets",
        subjectType: "ruleset_bundle",
        subjectId: manifest.version,
        data: { version: manifest.version },
      });
      return state;
    } catch (error) {
      const message = safeError(error);
      const previous = this.state();
      const state: RulesetState = { ...previous, status: previous.activeVersion ? "ready" : "error", checkedAt, lastError: message };
      this.db.setSetting("rulesets", state);
      if (previous.lastError !== message) {
        this.journal.record("rulesets.update_failed", {
          actor: "ruleset-updater",
          source: "rulesets",
          severity: "warning",
          subjectType: "ruleset_bundle",
          data: { error: message, retainedVersion: previous.activeVersion },
        });
      }
      return state;
    } finally {
      rmSync(incoming, { recursive: true, force: true });
    }
  }

  private required(rules: RouteRule[]) {
    return [...new Map(rules
      .filter((rule) => Boolean(rule.enabled) && (rule.matcher === "GEOSITE" || rule.matcher === "GEOIP"))
      .map((rule) => {
        const family = rule.matcher.toLowerCase() as Family;
        const code = normalizeCode(rule.value);
        return [`${family}:${code}`, { family, code }] as const;
      })).values()];
  }

  private complete(manifest: RulesetManifest) {
    try {
      validateFiles(join(config.rulesetDir, manifest.version), manifest);
      return true;
    } catch {
      return false;
    }
  }

  private cleanup(active: string) {
    const versions = readdirSync(config.rulesetDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== active)
      .map((entry) => ({ name: entry.name, mtime: statSync(join(config.rulesetDir, entry.name)).mtimeMs }))
      .sort((left, right) => right.mtime - left.mtime);
    for (const stale of versions.slice(2)) rmSync(join(config.rulesetDir, stale.name), { recursive: true, force: true });
  }
}

function parseManifest(value: unknown): RulesetManifest {
  if (!value || typeof value !== "object") throw new Error("Некорректный индекс наборов");
  const manifest = value as Partial<RulesetManifest>;
  if (!manifest.version || !/^[a-zA-Z0-9._-]{1,80}$/.test(manifest.version)) throw new Error("Некорректная версия наборов");
  if (!manifest.bundle || !/^https:\/\//.test(manifest.bundle.url) || !/^[a-f0-9]{64}$/.test(manifest.bundle.sha256)) {
    throw new Error("Некорректное описание архива наборов");
  }
  if (!manifest.codes || !Array.isArray(manifest.codes.geosite) || !Array.isArray(manifest.codes.geoip)) {
    throw new Error("Индекс наборов не содержит каталог кодов");
  }
  return {
    version: manifest.version,
    bundle: manifest.bundle,
    codes: {
      geosite: [...new Set(manifest.codes.geosite.map(normalizeCode))].sort(),
      geoip: [...new Set(manifest.codes.geoip.map(normalizeCode))].sort(),
    },
    source: manifest.source,
  };
}

function validateFiles(directory: string, manifest: RulesetManifest) {
  for (const family of ["geosite", "geoip"] as const) {
    for (const code of manifest.codes[family]) {
      const file = join(directory, family, `${code}.srs`);
      if (!existsSync(file) || !lstatSync(file).isFile() || statSync(file).size < 8) {
        throw new Error(`В архиве отсутствует ${family}:${code}`);
      }
      const header = readFileSync(file).subarray(0, 4);
      if (header[0] !== 0x53 || header[1] !== 0x52 || header[2] !== 0x53 || header[3] === 0) {
        throw new Error(`Некорректная структура SRS для ${family}:${code}`);
      }
    }
  }
}

function normalizeCode(value: string) {
  const code = value.trim().toLowerCase();
  if (!/^[a-z0-9_@.!+-]{1,80}$/.test(code)) throw new ServiceError(400, "Некорректный GeoIP/Geosite-код");
  return code;
}

function unsafeEntry(value: string) {
  const normalized = value.replace(/^\.\//, "");
  return value.startsWith("/")
    || normalized.split("/").includes("..")
    || !/^(?:(?:geosite|geoip|licenses)\/?|(?:geosite|geoip)\/[a-zA-Z0-9_@.!+-]+\.srs|licenses\/sing-(?:geosite|geoip)\.txt|sources\.json|THIRD_PARTY_NOTICES\.md)$/.test(normalized);
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function command(args: string[], message: string) {
  const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
  ]);
  if (code !== 0) throw new Error(`${message}: ${stderr.trim() || stdout.trim()}`);
  return stdout;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
