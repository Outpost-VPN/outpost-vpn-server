import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../src/server/config";
import {
  mihomoRenderer,
  singBoxRenderer,
  xrayJsonRenderer,
  type SubscriptionContext,
} from "../src/server/adapters/subscriptions";

const context: SubscriptionContext = {
  connection: {
    id: "native-check", serial: 1, name: "Native check", color: "blue", avatar: "avatar-person",
    status: "active", generation: 1, created_at: "", updated_at: "", activated_at: "", first_used_at: null,
    last_fetched_at: null, first_seen_at: null, last_seen_at: null, absence_notified_at: null, archived_at: null,
  },
  credentials: {
    connectionId: "native-check",
    generation: 1,
    hysteria: { id: "native-check", password: "native-check-password" },
    xray: { id: "f8e5bb4d-483a-4f57-b2fe-cda0d799cb83", email: "native-check.1@outpost.local" },
  },
  routes: [
    { id: "local", position: 0, action: "DIRECT", matcher: "IP_CIDR", value: "10.0.0.0/8", source: "system", locked: true, enabled: true, created_at: "", updated_at: "" },
    { id: "ads-exact", position: 1, action: "BLOCK", matcher: "DOMAIN", value: "ads.example", source: "user", locked: false, enabled: true, created_at: "", updated_at: "" },
    { id: "ads-suffix", position: 1, action: "BLOCK", matcher: "SUFFIX", value: ".tracking.example", source: "user", locked: false, enabled: true, created_at: "", updated_at: "" },
    { id: "ads-keyword", position: 1, action: "BLOCK", matcher: "DOMAIN_KEYWORD", value: "sponsor", source: "user", locked: false, enabled: true, created_at: "", updated_at: "" },
    { id: "ads-regex", position: 1, action: "BLOCK", matcher: "DOMAIN_REGEX", value: String.raw`^speed\.(coe|open)\.ad\.[a-z]{2,6}\.prod\.hosts\.ooklaserver\.net$`, source: "user", locked: false, enabled: true, created_at: "", updated_at: "" },
    { id: "fallback", position: 2, action: "PROXY", matcher: "SUFFIX", value: "*", source: "system", locked: true, enabled: true, created_at: "", updated_at: "" },
  ],
  subscriptionToken: "native-check-token",
  engineOrder: ["hysteria", "xray"],
};

const directory = mkdtempSync(join(tmpdir(), "outpost-native-subscriptions-"));
try {
  const files = {
    mihomo: join(directory, "mihomo.yaml"),
    singBox: join(directory, "sing-box.json"),
    xray: join(directory, "xray.json"),
  };
  writeFileSync(files.mihomo, mihomoRenderer.render(context).body);
  writeFileSync(files.singBox, singBoxRenderer.render(context).body);
  writeFileSync(files.xray, xrayJsonRenderer.render(context).body);
  const mihomoHome = join(directory, "mihomo-home");
  mkdirSync(mihomoHome);

  await check(binary("OUTPOST_MIHOMO_BINARY", "mihomo"), ["-t", "-d", mihomoHome, "-f", files.mihomo]);
  if (existsSync(join(mihomoHome, "GeoSite.dat"))) throw new Error("Mihomo downloaded GeoSite.dat for a materialized profile");
  await check(binary("OUTPOST_SING_BOX_BINARY", "sing-box"), ["check", "-c", files.singBox]);
  await check(binary("OUTPOST_XRAY_BINARY", "xray"), ["run", "-test", "-config", files.xray]);
  console.log(`Native subscription validation passed for ${config.domain}`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

function binary(environment: string, fallback: string) {
  const bundled = resolve(import.meta.dir, "..", ".cache", "native-tools", fallback);
  const value = process.env[environment] || (existsSync(bundled) ? bundled : Bun.which(fallback));
  if (!value) throw new Error(`${fallback} not found; set ${environment}`);
  return value;
}

async function check(executable: string, args: string[]) {
  const process = Bun.spawn([executable, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0) throw new Error(`${executable} ${args.join(" ")} failed:\n${stderr || stdout}`);
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.log(stderr.trim());
}
