import {engineIds, engines, type EngineId} from "../../shared/engines";
import {compareVersions, parseVersion} from "../releases";

export type ReleaseFetch = (url: string, options?: RequestInit) => Promise<Response>;
export type EngineArtifact = {version: string; checksum: string; url: string; archive: string; signatureUrl?: string};
export type EngineRelease = {checkedAt: number; latest: string | null; url: string | null; artifact: EngineArtifact | null; error: "unavailable" | null; pending?: "bundle" | "artifact"};
type Release = {tag_name: string; name: string; draft: boolean; prerelease: boolean; assets?: Array<{name: string; digest?: string; browser_download_url: string}>};
const bundleRepository = "Outpost-VPN/outpost-vpn-server";

export class EngineReleases {
  constructor(private fetcher: ReleaseFetch = globalThis.fetch) {}

  private async github(repository: string, path: string) {
    const response = await this.fetcher(`https://api.github.com/repos/${repository}/${path}`, {
      headers: {accept:"application/vnd.github+json", "user-agent":"Outpost-engine-updater"}, signal:AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Official release metadata: HTTP ${response.status}`);
    return response.json();
  }

  async latest(engine: EngineId): Promise<EngineRelease> {
    const checkedAt = Date.now();
    try {
      const definition = engines[engine];
      const bundled = definition.archive === "bundled";
      const releases = await this.github(definition.repository, `${bundled ? "tags" : "releases"}?per_page=50`) as Release[];
      const candidates = releases.map((release) => {
        const tag = bundled ? release.name : release.tag_name;
        const version = tag.replace(engine === "hysteria" ? /^app\/v/ : /^v/, "");
        return {release, tag, version, prerelease: bundled ? Boolean(parseVersion(version)?.prerelease.length) : release.prerelease};
      }).filter(({release, tag, version, prerelease}) => !release.draft && (!prerelease || ("prerelease" in definition && definition.prerelease))
        && parseVersion(version) && (engine !== "hysteria" || tag.startsWith("app/v")))
        .sort((a,b) => compareVersions(b.version,a.version));
      const latest = candidates[0];
      if (!latest) throw new Error("No matching official version");
      const base = {checkedAt, latest:latest.version, url:`https://github.com/${definition.repository}/${bundled ? "tree" : "releases/tag"}/${encodeURIComponent(latest.tag)}`, error:null};
      try {
        const artifact = bundled ? await this.resolve(engine, latest.version) : this.artifact(engine, latest.version, latest.release);
        return {...base, artifact};
      } catch {
        return {...base, artifact:null, pending:bundled ? "bundle" : "artifact"};
      }
    } catch {return {checkedAt,latest:null,url:null,artifact:null,error:"unavailable"};}
  }

  async resolve(engine: EngineId, version: string): Promise<EngineArtifact> {
    if (!engineIds.includes(engine) || !parseVersion(version) || !/^[0-9][0-9A-Za-z.-]{0,39}$/.test(version)) throw new Error("Invalid engine version");
    const definition = engines[engine];
    // The initial installation remains available offline from release metadata.
    if (version === definition.version) return {version,checksum:definition.sha256,
      url:definition.archive === "bundled" ? "" : `https://github.com/${definition.repository}/releases/download/${encodeURIComponent(definition.tag)}/${definition.asset}`,
      archive:definition.archive};
    const repository = engine === "amneziawg" ? bundleRepository : definition.repository;
    const tag = engine === "amneziawg" ? `engine-amneziawg-v${version}` : definition.tag.replace(definition.version, version);
    const release = await this.github(repository, `releases/tags/${encodeURIComponent(tag)}`) as Release;
    return this.artifact(engine, version, release);
  }

  private artifact(engine: EngineId, version: string, release: Release): EngineArtifact {
    const definition = engines[engine];
    const bundled = engine === "amneziawg";
    const tag = bundled ? `engine-amneziawg-v${version}` : definition.tag.replace(definition.version, version);
    if (release.tag_name !== tag || release.draft || (release.prerelease && !("prerelease" in definition && definition.prerelease))) throw new Error("Release does not match requested version/channel");
    const name = bundled ? `outpost-engine-amneziawg-${version}-linux-amd64.tar.gz` : definition.asset.replaceAll(definition.version,version);
    const repository = bundled ? bundleRepository : definition.repository;
    const url = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${name}`;
    const asset = release.assets?.find((asset) => asset.name === name);
    const checksum = asset?.digest?.match(/^sha256:([a-f0-9]{64})$/)?.[1];
    // GitHub returns Hysteria's app/v tags with a literal slash, while the
    // request/download path may encode it. Always download our reconstructed URL.
    if (!checksum || !asset || decodeURIComponent(asset.browser_download_url) !== decodeURIComponent(url)) throw new Error("Official artifact/digest is unavailable");
    const signatureUrl = bundled ? `${url}.minisig` : undefined;
    if (signatureUrl && !release.assets?.some((asset) => asset.name === `${name}.minisig` && asset.browser_download_url === signatureUrl)) throw new Error("Signed runtime bundle is unavailable");
    return {version,checksum,url,archive:bundled ? "tar.gz" : definition.archive,...(signatureUrl ? {signatureUrl} : {})};
  }
}
