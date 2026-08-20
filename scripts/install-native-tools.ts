import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";

type Asset = { name: string; browser_download_url: string; digest: string | null };
type Release = { tag_name: string; assets: Asset[] };

const root = resolve(import.meta.dir, "..");
const output = resolve(process.env.OUTPOST_NATIVE_TOOLS_DIR ?? join(root, ".cache", "native-tools"));
const temporary = mkdtempSync(join(tmpdir(), "outpost-native-tools-"));
const platform = process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : null;
const architecture = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "amd64" : null;
if (!platform || !architecture) throw new Error(`Unsupported native validation host: ${process.platform}/${process.arch}`);
mkdirSync(output, { recursive: true });

try {
  const mihomo = await release("MetaCubeX/mihomo", "v1.19.30");
  const mihomoName = `mihomo-${platform}-${architecture}-v1.19.30.gz`;
  const mihomoAsset = asset(mihomo, exact(mihomoName));
  const mihomoArchive = await verified(mihomoAsset);
  writeFileSync(join(output, "mihomo"), gunzipSync(mihomoArchive));

  const singBox = await release("SagerNet/sing-box", "v1.13.19");
  const singName = `sing-box-1.13.19-${platform}-${architecture}.tar.gz`;
  const singAsset = asset(singBox, exact(singName));
  const singArchive = join(temporary, singAsset.name);
  writeFileSync(singArchive, await verified(singAsset));
  const singExtracted = join(temporary, "sing-box");
  mkdirSync(singExtracted);
  await command(["tar", "-xzf", singArchive, "-C", singExtracted]);
  copyFileSync(find(singExtracted, "sing-box"), join(output, "sing-box"));

  const xray = await release("XTLS/Xray-core", "v26.7.28");
  const xrayName = platform === "darwin"
    ? architecture === "arm64" ? "Xray-macos-arm64-v8a.zip" : "Xray-macos-64.zip"
    : architecture === "arm64" ? "Xray-linux-arm64-v8a.zip" : "Xray-linux-64.zip";
  const xrayAsset = asset(xray, exact(xrayName));
  const xrayArchive = join(temporary, xrayAsset.name);
  writeFileSync(xrayArchive, await verified(xrayAsset));
  const xrayExtracted = join(temporary, "xray");
  mkdirSync(xrayExtracted);
  await command(["unzip", "-q", xrayArchive, "-d", xrayExtracted]);
  copyFileSync(find(xrayExtracted, "xray"), join(output, "xray"));

  for (const name of ["mihomo", "sing-box", "xray"]) chmodSync(join(output, name), 0o755);
  console.log(output);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

async function release(repository: string, tag: string): Promise<Release> {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, {
    headers: { "user-agent": "outpost-native-validator", accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Release ${repository}@${tag} is unavailable`);
  return response.json() as Promise<Release>;
}

function asset(release: Release, pattern: RegExp) {
  const found = release.assets.find((item) => pattern.test(item.name));
  if (!found) throw new Error(`Asset ${pattern} is missing from ${release.tag_name}`);
  return found;
}

function exact(value: string) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

async function verified(asset: Asset) {
  if (!asset.digest?.startsWith("sha256:")) throw new Error(`GitHub did not provide a SHA-256 digest for ${asset.name}`);
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Cannot download ${asset.name}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== asset.digest.slice(7)) throw new Error(`SHA-256 mismatch for ${asset.name}`);
  return bytes;
}

function find(directory: string, name: string): string {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      try { return find(path, name); } catch {}
    } else if (entry.isFile() && basename(path) === name && statSync(path).size > 0) {
      return path;
    }
  }
  throw new Error(`${name} is missing from extracted archive`);
}

async function command(argv: string[]) {
  const child = Bun.spawn(argv, { stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${argv[0]} exited with ${code}`);
}
