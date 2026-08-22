import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const version = process.env.OUTPOST_VERSION ?? JSON.parse(await Bun.file(join(root, "package.json")).text()).version;
const target = process.env.OUTPOST_RELEASE_TARGET ?? "linux-amd64";
if (target !== "linux-amd64") throw new Error(`Unsupported release target: ${target}`);

const releaseRoot = join(root, "release");
const stage = join(releaseRoot, `outpost-${version}`);
const dist = join(root, "dist");
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "bin"), { recursive: true });

await command(["bun", "run", "build:web"]);
await command(["bun", "build", "src/server/index.ts", "--compile", "--target=bun-linux-x64-baseline", `--outfile=${join(dist, "outpost")}`]);
await command(["bun", "build", "src/cli/index.ts", "--compile", "--target=bun-linux-x64-baseline", `--outfile=${join(dist, "outpostctl")}`]);

const suppliedAgent = process.env.OUTPOST_AGENT_BINARY;
if (suppliedAgent) {
  const sourceAgent = resolve(root, suppliedAgent);
  const targetAgent = join(dist, "outpost-agent");
  if (sourceAgent !== targetAgent) cpSync(sourceAgent, targetAgent);
  if (!existsSync(targetAgent)) throw new Error(`Linux agent binary not found: ${sourceAgent}`);
} else if (Bun.which("go")) {
  await command(["go", "build", "-trimpath", "-ldflags", "-s -w", "-o", join(dist, "outpost-agent"), "./cmd/outpost-agent"], join(root, "agent"), {
    GOOS: "linux",
    GOARCH: "amd64",
    CGO_ENABLED: "0",
  });
} else {
  throw new Error("Go не найден. Установите Go или задайте OUTPOST_AGENT_BINARY для linux/amd64.");
}

for (const name of ["outpost", "outpostctl", "outpost-agent"]) {
  cpSync(join(dist, name), join(stage, "bin", name));
  chmodSync(join(stage, "bin", name), 0o755);
}
cpSync(join(root, "public"), join(stage, "public"), { recursive: true });
cpSync(join(root, "infra"), join(stage, "infra"), { recursive: true });
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md", "README.md"]) {
  if (existsSync(join(root, name))) cpSync(join(root, name), join(stage, name));
}

writeFileSync(join(stage, "manifest.json"), `${JSON.stringify({ name: "outpost", version, target, createdAt: new Date().toISOString() }, null, 2)}\n`);

const files = Array.from(new Bun.Glob("**/*").scanSync({ cwd: stage, onlyFiles: true }))
  .filter((file) => file !== "SHA256SUMS")
  .sort();
const checksums: string[] = [];
for (const file of files) {
  const hash = new Bun.CryptoHasher("sha256").update(await Bun.file(join(stage, file)).arrayBuffer()).digest("hex");
  checksums.push(`${hash}  ${file}`);
}
writeFileSync(join(stage, "SHA256SUMS"), `${checksums.join("\n")}\n`);

const archive = join(releaseRoot, `${basename(stage)}-linux-amd64.tar.gz`);
await command(["tar", "--owner=0", "--group=0", "--numeric-owner", "-czf", archive, "-C", releaseRoot, basename(stage)]);
const secretKey = process.env.OUTPOST_MINISIGN_SECRET_KEY;
if (secretKey) {
  if (!existsSync(secretKey)) throw new Error(`Minisign secret key not found: ${secretKey}`);
  const signature = `${archive}.minisig`;
  await command([
    "minisign", "-S", "-W", "-s", secretKey, "-m", archive, "-x", signature,
    "-t", `Outpost ${version} ${target}`,
  ]);
  await command(["minisign", "-V", "-m", archive, "-x", signature, "-p", join(root, "infra/release/minisign.pub")]);
  console.log(signature);
} else if (process.env.OUTPOST_REQUIRE_SIGNATURE === "1") {
  throw new Error("OUTPOST_MINISIGN_SECRET_KEY is required for a signed release");
}
console.log(archive);

async function command(argv: string[], cwd = root, env?: Record<string, string>) {
  const child = Bun.spawn(argv, { cwd, env: { ...process.env, ...env }, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${argv[0]} exited with ${code}`);
}
