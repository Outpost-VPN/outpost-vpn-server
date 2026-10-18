import { createHash, X509Certificate } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { binary, command, waitForPort, freePorts, ProcessGroup } from "./lib/native-integration";
import { renderEngine } from "../src/server/adapters/engines";
import { defaultEngineTemplates } from "../src/server/adapters/engine-presets";
import { mihomoRenderer, singBoxRenderer, type SubscriptionContext } from "../src/server/adapters/subscriptions";
import { engineIds } from "../src/shared/engines";

const directory = mkdtempSync(join(tmpdir(), "outpost-additional-transport-"));
const processes = new ProcessGroup();
const hysteria = binary("OUTPOST_HYSTERIA_BINARY", "hysteria");
const mihomo = binary("OUTPOST_MIHOMO_BINARY", "mihomo");
const sing = binary("OUTPOST_SING_BOX_BINARY", "sing-box");
const openssl = binary("OUTPOST_OPENSSL_BINARY", "openssl");
const curl = binary("OUTPOST_CURL_BINARY", "curl");
const [anytlsPort, trustPort, naivePort, proxyPort, hysteriaPort, statsPort] = await freePorts(6);
const credential = { connectionId: "integration", serial: 1, generation: 1,
  hysteria: { id: "integration", password: "integration-only-secret" },
  xray: { id: "f8e5bb4d-483a-4f57-b2fe-cda0d799cb83", email: "integration.1@outpost.local" } };
const context = { connection: { id: "integration", serial: 1, name: "Integration", color: "blue", avatar: "avatar-person", status: "active", generation: 1, created_at: "", updated_at: "", activated_at: null, first_used_at: null, last_fetched_at: null, first_seen_at: null, last_seen_at: null, absence_notified_at: null, suspended_at: null, archived_at: null }, credentials: credential, routes: [], subscriptionToken: "integration", engineOrder: engineIds,
  protocols: ["hysteria2", "xhttp", "grpc", "anytls", "trusttunnel", "naive"], enabledEngines: engineIds } as SubscriptionContext;
const auth = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  const body = await request.json() as { auth?: string };
  return Response.json({ ok: body.auth === credential.hysteria.password, id: credential.connectionId });
} });
const origin = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("verified-outpost-origin") });
try {
  const certificate = join(directory, "certificate.pem");
  const key = join(directory, "key.pem");
  await command([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost", "-keyout", key, "-out", certificate]);
  const fingerprint = createHash("sha256").update(new X509Certificate(readFileSync(certificate)).raw).digest("hex");
  const tlsPaths = (text: string) => text.replace(/\/etc\/letsencrypt\/live\/[^/]+\/fullchain.pem/g, certificate).replace(/\/etc\/letsencrypt\/live\/[^/]+\/privkey.pem/g, key);
  const hysteriaServer = YAML.parse(tlsPaths(renderEngine("hysteria", defaultEngineTemplates.hysteria, [credential])));
  hysteriaServer.listen = `127.0.0.1:${hysteriaPort}`;
  hysteriaServer.auth.http.url = `http://127.0.0.1:${auth.port}/`;
  hysteriaServer.trafficStats.listen = `127.0.0.1:${statsPort}`;
  const hysteriaPath = join(directory, "hysteria-server.yaml");
  writeFileSync(hysteriaPath, YAML.stringify(hysteriaServer), { mode: 0o600 });
  processes.launch([hysteria, "server", "--config", hysteriaPath]);
  await waitForPort(statsPort!);
  const mihomoServer = YAML.parse(tlsPaths(renderEngine("mihomo", defaultEngineTemplates.mihomo, [credential])));
  delete mihomoServer["external-controller"];
  delete mihomoServer.secret;
  mihomoServer.listeners[0].port = anytlsPort;
  mihomoServer.listeners[1].port = trustPort;
  for (const listener of mihomoServer.listeners) listener.listen = "127.0.0.1";
  // Permit just this test fixture before the production private-network policy.
  mihomoServer.rules.unshift(`IP-CIDR,127.0.0.1/32,DIRECT,no-resolve`);
  const serverPath = join(directory, "mihomo-server.yaml");
  writeFileSync(serverPath, YAML.stringify(mihomoServer), { mode: 0o600 });
  mkdirSync(join(directory, "mihomo-server"));
  processes.launch([mihomo, "-d", join(directory, "mihomo-server"), "-f", serverPath], { SAFE_PATHS: directory });

  const singServer = JSON.parse(tlsPaths(renderEngine("sing-box", defaultEngineTemplates["sing-box"], [credential])));
  singServer.inbounds[0].listen = "127.0.0.1";
  singServer.inbounds[0].listen_port = naivePort;
  singServer.route.rules.unshift({ ip_cidr: ["127.0.0.1/32"], action: "route", outbound: "direct" });
  const naiveServerPath = join(directory, "sing-server.json");
  writeFileSync(naiveServerPath, JSON.stringify(singServer), { mode: 0o600 });
  processes.launch([sing, "run", "-c", naiveServerPath]);
  await Promise.all([waitForPort(anytlsPort!), waitForPort(trustPort!), waitForPort(naivePort!)]);

  for (const protocol of ["hysteria2", "anytls", "trusttunnel", "naive"] as const) {
    for (const valid of [true, false]) {
      let child: Bun.Subprocess;
      if (protocol === "trusttunnel") {
        const proxy = YAML.parse(mihomoRenderer.render(context).body).proxies.find((proxy: { type: string }) => proxy.type === protocol);
        Object.assign(proxy, { server: "127.0.0.1", port: trustPort, sni: "localhost", fingerprint });
        if (!valid) proxy.password += "-invalid";
        const home = join(directory, `trust-client-${valid}`);
        mkdirSync(home);
        const path = join(home, "config.yaml");
        writeFileSync(path, YAML.stringify({ "mixed-port": proxyPort, "bind-address": "127.0.0.1", mode: "rule", "log-level": "warning",
          proxies: [proxy], rules: [`MATCH,${proxy.name}`] }), { mode: 0o600 });
        child = processes.launch([mihomo, "-d", home, "-f", path]);
      } else {
        const outbound = JSON.parse(singBoxRenderer.render(context).body).outbounds.find((proxy: { type: string }) => proxy.type === protocol);
        Object.assign(outbound, { server: "127.0.0.1", server_port: protocol === "hysteria2" ? hysteriaPort : protocol === "anytls" ? anytlsPort : naivePort });
        outbound.tls.server_name = "localhost";
        outbound.tls.certificate_path = certificate;
        if (!valid) outbound.password += "-invalid";
        const path = join(directory, `${protocol}-client-${valid}.json`);
        writeFileSync(path, JSON.stringify({ log: { level: "error" },
          inbounds: [{ type: "socks", listen: "127.0.0.1", listen_port: proxyPort }], outbounds: [outbound] }), { mode: 0o600 });
        child = processes.launch([sing, "run", "-c", path]);
      }
      await waitForPort(proxyPort!);
      let succeeded = false;
      try {
        const body = await command([curl, "--noproxy", "", "--silent", "--show-error", "--fail", "--max-time", "5", "--socks5-hostname", `127.0.0.1:${proxyPort}`, `http://127.0.0.1:${origin.port}/`]);
        succeeded = body === "verified-outpost-origin";
      } catch {}
      child.kill(); await child.exited;
      if (succeeded !== valid) throw new Error(`${protocol}: ${valid ? "authenticated request failed" : "invalid password was accepted"}`);
    }
    console.log(`${protocol}: verified TLS, authenticated transfer and invalid-password rejection passed`);
  }
} finally {
  await processes.close();
  origin.stop(true);
  auth.stop(true);
  rmSync(directory, { recursive: true, force: true });
}
