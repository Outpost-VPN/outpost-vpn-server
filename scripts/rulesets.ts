import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

type Family = "geosite" | "geoip";
type Source = { repository: string; branch: string; commit: string; license: string };

const root = resolve(import.meta.dir, "..");
const output = resolve(process.env.OUTPOST_RULESET_OUTPUT ?? join(root, "release"));
const repository = process.env.GITHUB_REPOSITORY ?? "Outpost-VPN/outpost-vpn-server";
const sources: Record<Family, Source> = {
  geosite: await source("SagerNet/sing-geosite"),
  geoip: await source("SagerNet/sing-geoip"),
};
const requestedVersion = process.env.OUTPOST_RULESET_VERSION?.trim();
const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const version = requestedVersion || `${date}-${sources.geosite.commit.slice(0, 7)}-${sources.geoip.commit.slice(0, 7)}`;
if (!/^[a-zA-Z0-9._-]{1,80}$/.test(version)) throw new Error("Invalid OUTPOST_RULESET_VERSION");

const temporary = mkdtempSync(join(tmpdir(), "outpost-ruleset-build-"));
const stage = join(temporary, "stage");
mkdirSync(stage, { recursive: true });
mkdirSync(join(stage, "licenses"));

try {
  const codes = { geosite: [] as string[], geoip: [] as string[] };
  for (const family of ["geosite", "geoip"] as const) {
    const current = sources[family];
    const archive = join(temporary, `${family}.tar.gz`);
    writeFileSync(archive, await download(`https://github.com/${current.repository}/archive/${current.commit}.tar.gz`));
    const extracted = join(temporary, `${family}-source`);
    mkdirSync(extracted);
    await command(["tar", "-xzf", archive, "-C", extracted, "--no-same-owner", "--no-same-permissions"]);
    const target = join(stage, family);
    mkdirSync(target);
    const matches = files(extracted).filter((path) => basename(path).startsWith(`${family}-`) && path.endsWith(".srs"));
    for (const path of matches.sort()) {
      const code = basename(path).slice(family.length + 1, -4).toLowerCase();
      if (!/^[a-z0-9_@.!+-]{1,80}$/.test(code)) throw new Error(`Unsafe ${family} code: ${code}`);
      const destination = join(target, `${code}.srs`);
      if (existsSync(destination)) {
        if (sha256(path) !== sha256(destination)) throw new Error(`Conflicting ${family} code: ${code}`);
        continue;
      }
      if (!validSrs(path)) throw new Error(`Invalid ${family} SRS structure: ${code}`);
      copyFileSync(path, destination);
      codes[family].push(code);
    }
    if (!codes[family].length) throw new Error(`No ${family} SRS files found in ${current.repository}@${current.commit}`);
    codes[family].sort();
    writeFileSync(join(stage, "licenses", `sing-${family}.txt`), await download(current.license));
  }

  const sourceDocument = {
    generatedAt: new Date().toISOString(),
    version,
    sources: Object.fromEntries(Object.entries(sources).map(([family, value]) => [family, {
      repository: `https://github.com/${value.repository}`,
      branch: value.branch,
      commit: value.commit,
      tree: `https://github.com/${value.repository}/tree/${value.commit}`,
      license: value.license,
    }])),
  };
  writeFileSync(join(stage, "sources.json"), `${JSON.stringify(sourceDocument, null, 2)}\n`);
  writeFileSync(join(stage, "THIRD_PARTY_NOTICES.md"), `# Outpost rule-set bundle\n\nThe SRS files are generated and published by the official SagerNet sing-geosite and sing-geoip projects. Their source revisions are recorded in sources.json. Both projects are distributed under GPL-3.0-or-later; license texts are included in licenses/.\n`);

  mkdirSync(output, { recursive: true });
  const bundleName = `rulesets-${version}.tar.gz`;
  const bundlePath = join(output, bundleName);
  rmSync(bundlePath, { force: true });
  await command(["tar", "-czf", bundlePath, "-C", stage, "geosite", "geoip", "licenses", "sources.json", "THIRD_PARTY_NOTICES.md"]);
  const bundleUrl = process.env.OUTPOST_RULESET_BUNDLE_URL
    ?? `https://github.com/${repository}/releases/download/rulesets/${bundleName}`;
  const manifest = {
    version,
    bundle: { url: bundleUrl, sha256: sha256(bundlePath) },
    codes,
    source: {
      geosite: `https://github.com/${sources.geosite.repository}/tree/${sources.geosite.commit}`,
      geoip: `https://github.com/${sources.geoip.repository}/tree/${sources.geoip.commit}`,
    },
  };
  const manifestPath = join(output, "rulesets.json");
  const signaturePath = `${manifestPath}.minisig`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const secretKey = process.env.OUTPOST_MINISIGN_SECRET_KEY;
  if (secretKey) {
    if (!existsSync(secretKey)) throw new Error(`Minisign secret key not found: ${secretKey}`);
    await command(["minisign", "-S", "-W", "-s", secretKey, "-m", manifestPath, "-x", signaturePath, "-t", `Outpost rulesets ${version}`]);
    await command(["minisign", "-Vm", manifestPath, "-x", signaturePath, "-p", join(root, "infra/release/minisign.pub")]);
  } else if (process.env.OUTPOST_REQUIRE_SIGNATURE === "1") {
    throw new Error("OUTPOST_MINISIGN_SECRET_KEY is required for a signed rule-set release");
  }
  console.log(JSON.stringify({ version, bundlePath, manifestPath, signaturePath, codes: { geosite: codes.geosite.length, geoip: codes.geoip.length } }));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

async function source(repository: string): Promise<Source> {
  const branch = "rule-set";
  const response = await request(`https://api.github.com/repos/${repository}/commits/${branch}`, { accept: "application/vnd.github+json" });
  const payload = await response.json() as { sha?: string };
  if (!payload.sha || !/^[a-f0-9]{40}$/.test(payload.sha)) throw new Error(`Cannot resolve ${repository}/${branch}`);
  return { repository, branch, commit: payload.sha, license: `https://raw.githubusercontent.com/${repository}/main/LICENSE` };
}

async function download(url: string) {
  return new Uint8Array(await (await request(url)).arrayBuffer());
}

async function request(url: string, headers: Record<string, string> = {}) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(url, {
    headers: { "user-agent": "outpost-ruleset-builder", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return response;
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validSrs(path: string) {
  if (statSync(path).size < 8) return false;
  const header = readFileSync(path).subarray(0, 4);
  return header[0] === 0x53 && header[1] === 0x52 && header[2] === 0x53 && header[3] !== 0;
}

async function command(argv: string[]) {
  const child = Bun.spawn(argv, { stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${argv[0]} exited with ${code}`);
}
