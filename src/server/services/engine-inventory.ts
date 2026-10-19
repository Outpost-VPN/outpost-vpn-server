import { basename, dirname, join } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { engineIds, engines, engineTracksTraffic, serviceNames, type EngineId } from "../../shared/engines";
import type { OutpostDatabase } from "../db/database";
import { config } from "../config";
import {compareVersions} from "../releases";

export type EngineVersion = { engine: EngineId; installed_version: string | null; desired_version: string; checksum: string };
import {EngineReleases, type EngineRelease, type ReleaseFetch} from "../adapters/engine-releases";

export class EngineInventory {
  private checking = new Map<EngineId, Promise<EngineRelease>>();
  constructor(private db: OutpostDatabase) {}

  releaseChecks() {
    const stored = this.db.setting<Partial<Record<EngineId, EngineRelease>>>("engine_release_checks", {});
    return Object.fromEntries(this.versions().map((version) => {
      const check = stored[version.engine];
      return [version.engine, check ? {...check,
        newerThanPin: Boolean(check.latest && compareVersions(check.latest, engines[version.engine].version) > 0),
        newerThanInstalled: Boolean(check.latest && version.installed_version && compareVersions(check.latest, version.installed_version) > 0),
      } : null];
    }));
  }

  async checkReleases(actor = "owner", fetcher: ReleaseFetch = globalThis.fetch, selected?: EngineId) {
    const catalog = new EngineReleases(fetcher);
    const checks = await Promise.all((selected ? [selected] : engineIds).map(async (engine) => {
      let checking = this.checking.get(engine);
      if (!checking) {
        checking = catalog.latest(engine).finally(() => this.checking.delete(engine));
        this.checking.set(engine, checking);
      }
      return [engine, await checking] as const;
    }));
    const stored = this.db.setting<Partial<Record<EngineId, EngineRelease>>>("engine_release_checks", {});
    this.db.setSetting("engine_release_checks", {...stored, ...Object.fromEntries(checks)});
    this.db.audit({actor, action:"engines.check", resource:"engine_versions", resourceId:selected});
    return this.releaseChecks();
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
    const candidates = this.db.setting<Partial<Record<EngineId, EngineRelease>>>("engine_release_checks", {});
    return this.db.raw.query<EngineVersion, []>("SELECT engine, installed_version, desired_version, checksum FROM engine_versions ORDER BY engine").all().map((version) => {
      const artifact = candidates[version.engine]?.artifact;
      const candidate = artifact && compareVersions(artifact.version, version.desired_version) > 0
        ? {...version, desired_version:artifact.version, checksum:artifact.checksum} : version;
      return {...candidate, updateAvailable:!candidate.installed_version || compareVersions(candidate.desired_version, candidate.installed_version) > 0};
    });
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
