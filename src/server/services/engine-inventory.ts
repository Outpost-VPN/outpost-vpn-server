import { basename, dirname, join } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { engineIds, engines, engineTracksTraffic, serviceNames, type EngineId } from "../../shared/engines";
import type { OutpostDatabase } from "../db/database";
import { config } from "../config";
import {compareVersions, parseVersion} from "../releases";

export type EngineVersion = { engine: EngineId; installed_version: string | null; desired_version: string; checksum: string };
type ReleaseCheck = {checkedAt: number; latest: string | null; url: string | null; error: "unavailable" | null};

export class EngineInventory {
  private checking: Promise<ReturnType<EngineInventory["releaseChecks"]>> | null = null;
  constructor(private db: OutpostDatabase) {}

  releaseChecks() {
    const stored = this.db.setting<Partial<Record<EngineId, ReleaseCheck>>>("engine_release_checks", {});
    return Object.fromEntries(this.versions().map((version) => {
      const check = stored[version.engine];
      return [version.engine, check ? {...check,
        newerThanPin: Boolean(check.latest && compareVersions(check.latest, version.desired_version) > 0),
        newerThanInstalled: Boolean(check.latest && version.installed_version && compareVersions(check.latest, version.installed_version) > 0),
      } : null];
    }));
  }

  async checkReleases(actor = "owner", fetcher: (url: string, options?: RequestInit) => Promise<Response> = globalThis.fetch) {
    if (this.checking) return this.checking;
    this.checking = (async () => {
      const checks = await Promise.all(engineIds.map(async (engine) => {
        const definition = engines[engine];
        const bundled = definition.archive === "bundled";
        const checkedAt = Date.now();
        try {
          const response = await fetcher(`https://api.github.com/repos/${definition.repository}/${bundled ? "tags" : "releases"}?per_page=50`, {
            headers: {accept: "application/vnd.github+json", "user-agent": `Outpost/${config.version}`},
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) throw new Error("Release check failed");
          const releases = await response.json() as Array<{tag_name: string; name: string; draft: boolean; prerelease: boolean}>;
          const candidates = releases.map((release) => {
            const tag = bundled ? release.name : release.tag_name;
            const version = tag.replace(engine === "hysteria" ? /^app\/v/ : /^v/, "");
            return {tag, version, draft: release.draft, prerelease: bundled ? Boolean(parseVersion(version)?.prerelease.length) : release.prerelease};
          }).filter((release) => !release.draft && (!release.prerelease || ("prerelease" in definition && definition.prerelease))
              && parseVersion(release.version) && (engine !== "hysteria" || release.tag.startsWith("app/v")))
            .sort((a, b) => compareVersions(b.version, a.version));
          const latest = candidates[0];
          if (!latest) throw new Error("No matching release");
          return [engine, {checkedAt, latest: latest.version, url: `https://github.com/${definition.repository}/${bundled ? "tree" : "releases/tag"}/${encodeURIComponent(latest.tag)}`, error: null}] as const;
        } catch {
          return [engine, {checkedAt, latest: null, url: null, error: "unavailable" as const}] as const;
        }
      }));
      // Discovery is informational. Only the signed Outpost release owns
      // installable pins/checksums and the agent's update allowlist.
      this.db.setSetting("engine_release_checks", Object.fromEntries(checks));
      this.db.audit({actor, action: "engines.check", resource: "engine_versions"});
      return this.releaseChecks();
    })().finally(() => { this.checking = null; });
    return this.checking;
  }

  reconcilePins() {
    for (const engine of engineIds) {
      const pin = engines[engine];
      this.db.raw.query(`INSERT INTO engine_versions (engine, installed_version, desired_version, checksum, updated_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(engine) DO UPDATE SET desired_version = excluded.desired_version, checksum = excluded.checksum
      `).run(engine, pin.optional ? null : pin.version, pin.version, pin.sha256, new Date().toISOString());
      // Backups intentionally do not contain runtime binaries. A restored
      // database must not advertise optional runtimes missing from this host.
      if (config.production && pin.optional && !existsSync(`/opt/outpost/engines/${engine}/current/${pin.binary}`)) {
        this.db.raw.query("UPDATE engine_versions SET installed_version = NULL WHERE engine = ?").run(engine);
      }
    }
  }

  recoverInstallations(root = "/opt/outpost/engines") {
    for (const engine of engineIds) {
      let version: string | null = null;
      const binary = join(root, engine, "current", engines[engine].binary);
      if (existsSync(binary)) {
        const installed = basename(dirname(realpathSync(binary)));
        if (!/^[0-9][0-9A-Za-z.-]{0,39}$/.test(installed)) throw new Error(`Unsupported managed installation: ${engine}`);
        version = installed;
      }
      this.db.raw.query("UPDATE engine_versions SET installed_version = ?, updated_at = ? WHERE engine = ?")
        .run(version, new Date().toISOString(), engine);
    }
  }

  versions() {
    return this.db.raw.query<EngineVersion, []>("SELECT engine, installed_version, desired_version, checksum FROM engine_versions ORDER BY engine").all();
  }

  version(engine: string) { return this.versions().find((version) => version.engine === engine); }
  has(engine: EngineId) { return Boolean(this.version(engine)?.installed_version); }
  installed() { return this.versions().filter((version) => version.installed_version).map((version) => version.engine); }
  optionalInstalled() { return this.installed().filter((engine) => engines[engine].optional); }
  get limitedTelemetry() { return this.installed().some((engine) => !engineTracksTraffic(engine)); }

  recordInstallation(engine: EngineId, version: string) {
    this.db.raw.query("UPDATE engine_versions SET installed_version = ?, updated_at = ? WHERE engine = ?")
      .run(version, new Date().toISOString(), engine);
  }

  missingService(service: string) {
    const engine = engineIds.find((engine) => engines[engine].service === service);
    return Boolean(engine && engines[engine].optional && !this.has(engine));
  }

  services(observed?: Array<{ name: string; status: string }>) {
    return serviceNames.map((name) => ({ name,
      status: this.missingService(name) ? "not-installed" : observed?.find((service) => service.name === name)?.status ?? "unknown",
    }));
  }
}
