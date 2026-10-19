import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve, join} from "node:path";
import {parseVersion, compareVersions} from "../src/server/releases";
import pinnedSources from "../infra/amneziawg-sources.json";

// A standalone, signed engine release. It never builds/publishes the panel.
const version = Bun.argv[2] ?? "";
if (process.platform !== "linux" || !parseVersion(version) || !/^[0-9.]+$/.test(version)) throw new Error("Linux runner and a stable engine version are required");
const directory = resolve(".cache/engine-release");
const output = join(directory, "runtime");
mkdirSync(directory, {recursive:true});
async function github(repository: string, path: string) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {headers:{accept:"application/vnd.github+json", "user-agent":"Outpost-runtime-builder"}, signal:AbortSignal.timeout(30_000)});
  if (!response.ok) throw new Error(`Official source metadata: HTTP ${response.status}`);
  return response.json();
}
const sources = [];
for (const source of pinnedSources) {
  let tag = `v${version}`;
  if (source.name === "amneziawg-tools") {
    const tags = await github(source.repository,"tags?per_page=100") as Array<{name:string}>;
    const family = version.split(".").slice(0,2).join(".") + ".";
    const compatible = tags.map(({name}) => name.replace(/^v/, "")).filter((candidate) => parseVersion(candidate) && candidate.startsWith(family) && compareVersions(candidate,version) <= 0).sort((a,b) => compareVersions(b,a));
    if (!compatible[0]) throw new Error("No compatible official AWG tools tag");
    tag = `v${compatible[0]}`;
  }
  const info = await github(source.repository,`commits/${encodeURIComponent(tag)}`) as {sha:string};
  if (!/^[a-f0-9]{40}$/.test(info.sha)) throw new Error("Invalid source commit");
  const url = `https://codeload.github.com/${source.repository}/tar.gz/${info.sha}`;
  const response = await fetch(url, {signal:AbortSignal.timeout(60_000)});
  if (!response.ok) throw new Error("Official source archive unavailable");
  const sha256 = createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex");
  sources.push({...source,tag,commit:info.sha,url,sha256});
}
const manifest = join(directory,"sources.json");
writeFileSync(manifest,JSON.stringify(sources,null,2));
const child = Bun.spawn(["bun","scripts/build-amneziawg.ts"], {stdout:"inherit",stderr:"inherit",env:{...process.env,OUTPOST_AMNEZIA_SOURCES_FILE:manifest,OUTPOST_AMNEZIA_OUTPUT:output}});
if (await child.exited) throw new Error("Runtime build failed");
mkdirSync("release",{recursive:true});
const archive = resolve(`release/outpost-engine-amneziawg-${version}-linux-amd64.tar.gz`);
const packed = Bun.spawn(["tar","--owner=0","--group=0","-czf",archive,"-C",output,"."], {stdout:"inherit",stderr:"inherit"});
if (await packed.exited) throw new Error("Runtime packaging failed");
console.log(archive);
