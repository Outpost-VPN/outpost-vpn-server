import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pinnedSources from "../infra/amneziawg-sources.json";
import { verifiedDownload } from "./lib/verified-download";

// Build on the release runner; no compiler, source execution or kernel module
// installation is required on the VPS. Both sources are immutable and pinned.
if (process.platform !== "linux") throw new Error("AmneziaWG runtime builds require Linux");
const sources: typeof pinnedSources = process.env.OUTPOST_AMNEZIA_SOURCES_FILE ? await Bun.file(process.env.OUTPOST_AMNEZIA_SOURCES_FILE).json() : pinnedSources;
const output = resolve(process.env.OUTPOST_AMNEZIA_OUTPUT ?? "dist/engines/amneziawg");
const directory = mkdtempSync(join(tmpdir(), "outpost-amnezia-build-"));
mkdirSync(output, { recursive: true });
try {
  for (const source of sources) {
    const archive = join(directory, `${source.name}.tar.gz`);
    writeFileSync(archive, await verifiedDownload(source.url, source.sha256));
    copyFileSync(archive, join(output, `${source.name}-source.tar.gz`));
    const extracted = join(directory, source.name);
    mkdirSync(extracted);
    await command(["tar", "-xzf", archive, "--strip-components=1", "-C", extracted]);
    if (source.name === "amneziawg-go") {
      await command(["go", "build", "-trimpath", "-ldflags=-s -w", "-o", join(output, "amneziawg-go"), "."], extracted);
    } else {
      await command(["make", "-C", "src", "-j2", "WITH_BASHCOMPLETION=no", "WITH_WGQUICK=no", "WITH_SYSTEMDUNITS=no"], extracted);
      copyFileSync(join(extracted, "src/wg"), join(output, "awg"));
    }
    copyFileSync(join(extracted, source.name === "amneziawg-go" ? "LICENSE" : "COPYING"), join(output, `${source.name}.LICENSE`));
  }
  writeFileSync(join(output, "sources.json"), JSON.stringify(sources, null, 2) + "\n");
  writeFileSync(join(output, "SOURCE_SHA256"), sources[0]!.sha256 + "\n");
  const checksums = [];
  for (const name of ["amneziawg-go", "awg"]) {
    chmodSync(join(output, name), 0o755);
    const hash = createHash("sha256").update(new Uint8Array(await Bun.file(join(output, name)).arrayBuffer())).digest("hex");
    checksums.push(`${hash}  ${name}`);
  }
  writeFileSync(join(output, "SHA256SUMS"), checksums.join("\n") + "\n");
  console.log(`AmneziaWG 3.1 runtime built for linux/${process.arch}`);
} finally { rmSync(directory, { recursive: true, force: true }); }

async function command(argv: string[], cwd?: string) {
  const child = Bun.spawn(argv, { cwd, stdout: "inherit", stderr: "inherit", env: { ...process.env, CGO_ENABLED: "0" } });
  if (await child.exited) throw new Error(`${argv[0]} failed`);
}
