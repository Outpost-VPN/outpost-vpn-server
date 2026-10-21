import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";

// This fixture is only used by integration-release.sh on a disposable runner.
const localLab = process.env.OUTPOST_RELEASE_LAB === "1" && existsSync("/etc/outpost-release-lab");
if (!localLab && (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted")) {
  throw new Error("Release smoke fixtures require a disposable runner");
}
const [mode, source] = Bun.argv.slice(2);
if (!source || !["seed", "baseline", "expanded", "verify", "restored"].includes(mode!)) throw new Error("Expected fixture mode and source directory");
const root = resolve(source);
const { OutpostDatabase } = await import(join(root, "src/server/db/database.ts"));
const { HttpApplication } = await import(join(root, "src/server/http.ts"));
const db = new OutpostDatabase();
const app = new HttpApplication(db);
const record = "/var/tmp/outpost-release-smoke.json";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Profile = {path: string; agent: string; fingerprint?: string};

async function profileFingerprint(profile: Profile) {
  const {config} = await import(join(root, "src/server/config.ts"));
  const response = await fetch(`http://127.0.0.1:8181${profile.path}`, {
    headers: {host: config.domain, "user-agent": profile.agent},
  });
  if (!response.ok) throw new Error(`Existing subscription failed: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0];
  let body = await response.text();
  const decoded = Buffer.from(body, "base64").toString("utf8");
  if (decoded.startsWith("vless://")) body = decoded;
  body = body.replaceAll(config.publicIp, "SERVER_IP");
  // Happ's documented routing command may precede the same existing URI list.
  const value = contentType === "text/yaml" ? YAML.parse(body)
    : contentType === "application/json" ? JSON.parse(body)
    : body.split("\n").filter((line) => !line.startsWith("happ://routing/")).join("\n");
  function canonical(item: any): any {
    if (Array.isArray(item)) return item.map(canonical);
    return item && typeof item === "object"
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical(item[key])])) : item;
  }
  return hash({contentType, value: canonical(value)});
}

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
  } else if (mode === "baseline" || mode === "expanded") {
    const saved = JSON.parse(readFileSync(record, "utf8"));
    if (mode === "expanded") {
      const {engineIds} = await import(join(root, "src/shared/engines.ts"));
      const {defaultMethods} = await import(join(root, "src/shared/connection-methods.ts"));
      const {config} = await import(join(root, "src/server/config.ts"));
      db.engines.recoverInstallations();
      db.setSetting("connection_methods", defaultMethods(engineIds, {xhttp:config.xhttpPath, grpc:config.grpcService}));
      const {EngineConfigService} = await import(join(root, "src/server/adapters/engines.ts"));
      const {EngineRuntimeService} = await import(join(root, "src/server/services/engine-runtime.ts"));
      await new EngineConfigService(db).reconcilePresets(app.connections.activeCredentials(), "release-smoke", Object.fromEntries(engineIds.map((id: string) => [id,false])));
      await new EngineRuntimeService(db).prepareRecovery();
      saved.identity = hash(identity());
      saved.restoreIdentity = restoreIdentity();
    }
    const {applications, advancedDefinitions} = await import(join(root, "src/server/adapters/catalog.ts"));
    const profiles: Profile[] = [];
    for (const credential of app.connections.activeCredentials()) {
      const path = new URL(app.connections.subscription(credential.connectionId).url).pathname;
      for (const agent of ["Clash/1.0", "sing-box/1.0", "INCY/1.0", "Happ/1.0", "Xray/26.3.1", "v2rayN/7.0", "v2rayNG/1.10.0", "FoXray/1.0", "Streisand/1.0", "UnknownClient/1.0", ""]) {
        profiles.push({path, agent});
      }
      for (const item of applications) profiles.push({path: `${path}/apps/${item.id}`, agent: ""});
      for (const item of advancedDefinitions) profiles.push({path: `${path}/advanced/${item.id}`, agent: ""});
      profiles.push({path: `${path}/routes`, agent: ""});
    }
    for (const profile of profiles) profile.fingerprint = await profileFingerprint(profile);
    writeFileSync(record, JSON.stringify({...saved, profiles}), {mode: 0o600});
    console.log(`Recorded ${profiles.length} subscription responses from ${mode === "baseline" ? "the actual beta.4 server" : "the full restore source"}`);
  } else {
    const saved = JSON.parse(readFileSync(record, "utf8"));
    if (mode === "verify" && YAML.parse(readFileSync("/etc/outpost/engines/hysteria.yaml", "utf8")).speedTest !== true) throw new Error("Hysteria speedtest preset was not applied");
    if (hash(identity()) !== saved.identity) throw new Error("Owner, passkey, credentials or master key changed");
    if (mode === "restored" && restoreIdentity() !== saved.restoreIdentity) throw new Error("Restored credentials, methods or routes changed");
    if (!saved.profiles?.length) throw new Error("Missing baseline subscription responses");
    for (const profile of saved.profiles as Profile[]) {
      if (await profileFingerprint(profile) !== profile.fingerprint) {
        throw new Error(`Existing subscription changed: ${profile.path.replace(/\/s\/[^/]+/, "/s/<token>")} (${profile.agent || "no User-Agent"})`);
      }
    }
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
    console.log(`Identity, ${saved.profiles.length} subscription responses, API token and SQLite verified (${mode})`);
  }
} finally {
  db.close();
}

function restoreIdentity() {
  return hash({credentials:app.connections.activeCredentials(), methods:db.methods.list(),
    drafts:db.raw.query("SELECT * FROM route_drafts ORDER BY position").all(),
    revisions:db.raw.query("SELECT * FROM route_revisions ORDER BY version").all()});
}
