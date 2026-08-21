import { chmodSync, lstatSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { OutpostDatabase } from "../db/database";
import { now } from "../db/database";
import { config } from "../config";
import { compareVersions, isPrerelease, parseVersion } from "../releases";
import { ServiceError } from "./connections";

export type UpdateChannel = "stable" | "candidate";
export type UpdateStatus = "idle" | "checking" | "current" | "available" | "preparing" | "ready" | "failed";

export type ApplicationUpdateState = {
  status: UpdateStatus;
  channel: UpdateChannel;
  current: string;
  latest: string;
  available: boolean;
  ready: boolean;
  checkedAt: string | null;
  publishedAt: string | null;
  size: number | null;
  error: string | null;
};

type ReleaseAsset = { name: string; size: number; browser_download_url: string };
type GithubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: ReleaseAsset[];
};
type PreparedRelease = {
  version: string;
  tag: string;
  publishedAt: string | null;
  archive: ReleaseAsset;
  signature: ReleaseAsset;
};
type StoredUpdate = ApplicationUpdateState & { release?: PreparedRelease };
type PreparedUpdate = ApplicationUpdateState & {
  payload: { version: string; bundle: string; signature: string };
};
type UpdateDependencies = {
  fetch?: typeof globalThis.fetch;
  verify?: (archive: string, signature: string) => Promise<void>;
  current?: string;
  dataDir?: string;
  publicKey?: string;
  demo?: boolean;
};

const repository = "Outpost-VPN/outpost-vpn-server";
const releasesUrl = `https://api.github.com/repos/${repository}/releases?per_page=100`;
const downloadRoot = `https://github.com/${repository}/releases/download`;
const archiveLimit = 256 * 1024 * 1024;
const signatureLimit = 16 * 1024;

export class ApplicationUpdateService {
  private fetcher: typeof globalThis.fetch;
  private verify: (archive: string, signature: string) => Promise<void>;
  private current: string;
  private dataDir: string;
  private demo: boolean;
  private checking: Promise<ApplicationUpdateState> | null = null;
  private preparing: Promise<PreparedUpdate> | null = null;

  constructor(private db: OutpostDatabase, dependencies: UpdateDependencies = {}) {
    this.fetcher = dependencies.fetch ?? globalThis.fetch;
    this.current = dependencies.current ?? config.version;
    this.dataDir = dependencies.dataDir ?? config.dataDir;
    this.demo = dependencies.demo ?? config.demo;
    const publicKey = dependencies.publicKey ?? config.releasePublicKey;
    this.verify = dependencies.verify ?? ((archive, signature) => command(
      ["minisign", "-Vm", archive, "-x", signature, "-p", publicKey],
      "Подпись обновления недействительна",
    ));
    this.initializeChannel();
  }

  state(): ApplicationUpdateState {
    if (this.demo) return demoState(this.current, this.channel());
    const stored = this.stored();
    if (stored.current !== this.current || stored.channel !== this.channel()) return emptyState(this.current, this.channel());
    return publicState(stored);
  }

  reset() {
    this.save(emptyState(this.current, this.channel()));
    return this.state();
  }

  async check(actor = "owner") {
    if (this.demo) return demoState(this.current, this.channel());
    if (this.checking) return this.checking;
    this.checking = this.discover(actor).finally(() => { this.checking = null; });
    return this.checking;
  }

  async prepare(actor = "owner") {
    if (this.demo) return demoPrepared(this.current, this.channel());
    if (this.preparing) return this.preparing;
    this.preparing = this.download(actor).finally(() => { this.preparing = null; });
    return this.preparing;
  }

  private async discover(actor: string) {
    const channel = this.channel();
    this.save({ ...emptyState(this.current, channel), status: "checking" });
    const checkedAt = now();
    try {
      const response = await this.fetcher(releasesUrl, {
        headers: { accept: "application/vnd.github+json", "user-agent": `Outpost/${this.current}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`GitHub Releases недоступен: HTTP ${response.status}`);
      const releases = await response.json();
      if (!Array.isArray(releases)) throw new Error("GitHub Releases вернул некорректный ответ");
      const candidates = releases
        .map((release) => parseRelease(release, channel))
        .filter((release): release is PreparedRelease => Boolean(release))
        .filter((release) => compareVersions(release.version, this.current) > 0)
        .sort((left, right) => compareVersions(right.version, left.version));
      const release = candidates[0];
      const state: StoredUpdate = release ? {
        status: "available",
        channel,
        current: this.current,
        latest: release.version,
        available: true,
        ready: false,
        checkedAt,
        publishedAt: release.publishedAt,
        size: release.archive.size,
        error: null,
        release,
      } : { ...emptyState(this.current, channel), status: "current", checkedAt };
      this.save(state);
      this.db.audit({ actor, action: "updates.check", resource: "application_update", after: publicState(state) });
      return publicState(state);
    } catch (error) {
      const state: StoredUpdate = { ...emptyState(this.current, channel), status: "failed", checkedAt, error: safeError(error) };
      this.save(state);
      this.db.audit({ actor, action: "updates.check_failed", resource: "application_update", after: publicState(state) });
      return publicState(state);
    }
  }

  private async download(actor: string): Promise<PreparedUpdate> {
    if (this.checking) await this.checking;
    let stored = this.stored();
    if (stored.current !== this.current || stored.channel !== this.channel() || !stored.release) {
      await this.check(actor);
      stored = this.stored();
    }
    if (!stored.release || !stored.available || compareVersions(stored.release.version, this.current) <= 0) {
      throw new ServiceError(409, "Новая версия Outpost не найдена");
    }
    const release = validateStoredRelease(stored.release);
    const incoming = join(this.dataDir, "incoming");
    secureDirectory(incoming);
    const bundle = join(incoming, release.archive.name);
    const signature = join(incoming, release.signature.name);
    this.save({ ...stored, status: "preparing", ready: false, error: null });
    try {
      if (!await this.cached(bundle, signature, release)) {
        const temporaryBundle = join(incoming, `.${release.archive.name}.${crypto.randomUUID()}.part`);
        const temporarySignature = join(incoming, `.${release.signature.name}.${crypto.randomUUID()}.part`);
        try {
          await this.fetchAsset(release.archive, temporaryBundle, archiveLimit, 180_000);
          await this.fetchAsset(release.signature, temporarySignature, signatureLimit, 30_000);
          await this.verify(temporaryBundle, temporarySignature);
          renameSync(temporarySignature, signature);
          renameSync(temporaryBundle, bundle);
        } finally {
          rmSync(temporaryBundle, { force: true });
          rmSync(temporarySignature, { force: true });
        }
      }
      const next: StoredUpdate = { ...stored, status: "ready", ready: true, error: null };
      this.save(next);
      this.db.audit({ actor, action: "updates.prepare", resource: "application_update", resourceId: release.version, after: publicState(next) });
      return { ...publicState(next), payload: { version: release.version, bundle, signature } };
    } catch (error) {
      const next: StoredUpdate = { ...stored, status: "failed", ready: false, error: safeError(error) };
      this.save(next);
      this.db.audit({ actor, action: "updates.prepare_failed", resource: "application_update", resourceId: release.version, after: publicState(next) });
      throw new ServiceError(502, `Не удалось подготовить обновление: ${next.error}`, { reason: next.error });
    }
  }

  private async cached(bundle: string, signature: string, release: PreparedRelease) {
    try {
      if (!lstatSync(bundle).isFile() || !lstatSync(signature).isFile()) return false;
      if (statSync(bundle).size !== release.archive.size || statSync(signature).size !== release.signature.size) return false;
      await this.verify(bundle, signature);
      return true;
    } catch {
      return false;
    }
  }

  private async fetchAsset(asset: ReleaseAsset, path: string, limit: number, timeout: number) {
    if (asset.size < 1 || asset.size > limit) throw new Error(`Некорректный размер ${asset.name}`);
    const response = await this.fetcher(asset.browser_download_url, {
      headers: { accept: "application/octet-stream", "user-agent": `Outpost/${this.current}` },
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok || !response.body) throw new Error(`Не удалось загрузить ${asset.name}: HTTP ${response.status}`);
    const file = await open(path, "wx", 0o600);
    let size = 0;
    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit || size > asset.size) throw new Error(`Размер ${asset.name} превышает заявленный`);
        let offset = 0;
        while (offset < value.byteLength) {
          const result = await file.write(value, offset, value.byteLength - offset);
          if (!result.bytesWritten) throw new Error(`Не удалось записать ${asset.name}`);
          offset += result.bytesWritten;
        }
      }
    } finally {
      await file.close();
    }
    if (size !== asset.size) throw new Error(`Размер ${asset.name} не совпадает с GitHub Release`);
  }

  private stored(): StoredUpdate {
    return this.db.setting<StoredUpdate>("application_update", emptyState(this.current, this.channel()));
  }

  private save(state: StoredUpdate | ApplicationUpdateState) {
    this.db.setSetting("application_update", state);
  }

  private channel(): UpdateChannel {
    const system = this.db.setting<{ updateChannel?: unknown }>("system", {});
    return system.updateChannel === "candidate" ? "candidate" : "stable";
  }

  private initializeChannel() {
    if (this.db.setting<boolean>("update_channel_v2", false)) return;
    const system = this.db.setting<{ timezone?: string; updateChannel?: string }>("system", {});
    if (isPrerelease(this.current) && system.updateChannel !== "candidate") {
      this.db.setSetting("system", { ...system, updateChannel: "candidate" });
    }
    this.db.setSetting("update_channel_v2", true);
  }
}

function parseRelease(value: unknown, channel: UpdateChannel): PreparedRelease | null {
  if (!value || typeof value !== "object") return null;
  const release = value as Partial<GithubRelease>;
  if (release.draft || typeof release.tag_name !== "string" || !Array.isArray(release.assets)) return null;
  const version = release.tag_name.startsWith("v") ? release.tag_name.slice(1) : "";
  if (!parseVersion(version)) return null;
  if (channel === "stable" && (release.prerelease || isPrerelease(version))) return null;
  const archiveName = `outpost-${version}-linux-amd64.tar.gz`;
  const signatureName = `${archiveName}.minisig`;
  const archive = release.assets.find((asset) => asset?.name === archiveName);
  const signature = release.assets.find((asset) => asset?.name === signatureName);
  if (!archive || !signature) return null;
  const expectedArchiveUrl = `${downloadRoot}/${release.tag_name}/${archiveName}`;
  const expectedSignatureUrl = `${expectedArchiveUrl}.minisig`;
  if (archive.browser_download_url !== expectedArchiveUrl || signature.browser_download_url !== expectedSignatureUrl) return null;
  if (!Number.isSafeInteger(archive.size) || archive.size < 1 || archive.size > archiveLimit) return null;
  if (!Number.isSafeInteger(signature.size) || signature.size < 1 || signature.size > signatureLimit) return null;
  return {
    version,
    tag: release.tag_name,
    publishedAt: typeof release.published_at === "string" ? release.published_at : null,
    archive,
    signature,
  };
}

function validateStoredRelease(release: PreparedRelease) {
  const parsed = parseRelease({
    tag_name: release.tag,
    draft: false,
    prerelease: isPrerelease(release.version),
    published_at: release.publishedAt,
    assets: [release.archive, release.signature],
  }, "candidate");
  if (!parsed || parsed.version !== release.version) throw new ServiceError(409, "Данные обновления устарели — проверьте версии заново");
  return parsed;
}

function emptyState(current: string, channel: UpdateChannel): ApplicationUpdateState {
  return {
    status: "idle",
    channel,
    current,
    latest: current,
    available: false,
    ready: false,
    checkedAt: null,
    publishedAt: null,
    size: null,
    error: null,
  };
}

function demoState(current: string, channel: UpdateChannel): ApplicationUpdateState {
  return { ...emptyState(current, channel), status: "available", latest: "0.1.1", available: true, checkedAt: now(), size: 84_720_495 };
}

function demoPrepared(current: string, channel: UpdateChannel): PreparedUpdate {
  const state = { ...demoState(current, channel), status: "ready" as const, ready: true };
  const bundle = `/var/lib/outpost/incoming/outpost-${state.latest}-linux-amd64.tar.gz`;
  return { ...state, payload: { version: state.latest, bundle, signature: `${bundle}.minisig` } };
}

function publicState(state: StoredUpdate | ApplicationUpdateState): ApplicationUpdateState {
  const { status, channel, current, latest, available, ready, checkedAt, publishedAt, size, error } = state;
  return { status, channel, current, latest, available, ready, checkedAt, publishedAt, size, error };
}

function secureDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw new Error("Каталог входящих обновлений небезопасен");
  chmodSync(path, 0o700);
}

async function command(args: string[], message: string) {
  const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
  ]);
  if (code !== 0) throw new Error(`${message}: ${stderr.trim() || stdout.trim()}`);
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
