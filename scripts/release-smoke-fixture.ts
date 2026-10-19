import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// This fixture is only used by integration-release.sh on a disposable runner.
if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted") {
  throw new Error("Release smoke fixtures require a disposable GitHub-hosted runner");
}
const [mode, source] = Bun.argv.slice(2);
if (!source || !["seed", "verify", "restored"].includes(mode!)) throw new Error("Expected fixture mode and source directory");
const root = resolve(source);
const { OutpostDatabase } = await import(join(root, "src/server/db/database.ts"));
const { HttpApplication } = await import(join(root, "src/server/http.ts"));
const db = new OutpostDatabase();
const app = new HttpApplication(db);
const record = "/var/tmp/outpost-release-smoke.json";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function identity() {
  return {
    owner: db.raw.query("SELECT id FROM owners ORDER BY id").all(),
    passkeys: db.raw.query("SELECT id, owner_id, hex(public_key) AS key, counter FROM passkeys ORDER BY id").all(),
    credentials: app.connections.activeCredentials().map((entry: any) => ({
      connectionId: entry.connectionId, generation: entry.generation, hysteria: entry.hysteria, xray: entry.xray,
    })).sort((a: any, b: any) => a.connectionId.localeCompare(b.connectionId)),
    master: createHash("sha256").update(readFileSync("/var/lib/outpost/master.key")).digest("hex"),
  };
}

try {
  if (mode === "seed") {
    const { seedDemo } = await import(join(root, "src/server/demo.ts"));
    const { EngineConfigService, defaultHysteriaTemplate, defaultXrayTemplate, renderHysteria, renderXray } =
      await import(join(root, "src/server/adapters/engines.ts"));
    await seedDemo(app);
    const owner = app.auth.authenticate();
    if (!owner) throw new Error("Demo fixture did not create an owner");
    db.raw.query("INSERT INTO passkeys (id, owner_id, public_key, created_at) VALUES (?, ?, ?, ?)")
      .run("release-smoke-passkey", owner.id, new Uint8Array([1, 2, 3]), new Date().toISOString());
    const credentials = app.connections.activeCredentials();
    await new EngineConfigService(db).reconcilePresets(credentials, "release-smoke", { hysteria: false, xray: false });
    writeFileSync("/etc/outpost/engines/hysteria.yaml", renderHysteria(defaultHysteriaTemplate), { mode: 0o640 });
    writeFileSync("/etc/outpost/engines/xray.json", renderXray(defaultXrayTemplate, credentials), { mode: 0o640 });
    const link = app.connections.subscription(credentials[0].connectionId);
    const apiToken = app.auth.createApiToken("release-smoke", ["system:read"]).token;
    writeFileSync(record, JSON.stringify({ identity: hash(identity()), path: new URL(link.url).pathname, apiToken }), { mode: 0o600 });
    console.log("Legacy fixture created with owner, passkey, active connections and engine presets");
  } else {
    const saved = JSON.parse(readFileSync(record, "utf8"));
    if (hash(identity()) !== saved.identity) throw new Error("Owner, passkey, credentials or master key changed");
    const { config } = await import(join(root, "src/server/config.ts"));
    const profile = await fetch(`http://127.0.0.1:8181${saved.path}`, {
      headers: { host: config.domain, "user-agent": "Clash/1.0" },
    });
    const body = await profile.text();
    if (!profile.ok || !body.includes("proxies:")) throw new Error(`Legacy subscription failed: HTTP ${profile.status}`);
    const settings = await fetch("http://127.0.0.1:8181/api/v1/system", {
      headers: { host: config.domain, authorization: `Bearer ${saved.apiToken}` },
    });
    if (!settings.ok) throw new Error(`Preserved API token failed: HTTP ${settings.status}`);
    if (mode === "restored" && config.publicIp !== "203.0.113.77") throw new Error("Restore replaced the destination server's IP");
    if (db.raw.query("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("Database integrity failed");
    console.log(`Identity, legacy subscription, API token and SQLite verified (${mode})`);
  }
} finally {
  db.close();
}
