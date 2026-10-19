import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import YAML from "yaml";
import {binary, command, freePorts, ProcessGroup, waitForPort} from "./lib/native-integration";
import {engineCapabilities, methodSettings, type ConnectionMethod} from "../src/shared/connection-methods";
import {renderEngine} from "../src/server/adapters/engines";
import {defaultEngineTemplates} from "../src/server/adapters/engine-presets";
import {MihomoCollector, SingBoxCollector} from "../src/server/adapters/traffic-collectors";
import {mihomoRenderer, singBoxRenderer, type SubscriptionContext} from "../src/server/adapters/subscriptions";

// Separate loopback-only processes; never touches the user's VPN or production.
const directory = mkdtempSync(join(tmpdir(), "outpost-telemetry-"));
const processes = new ProcessGroup();
const mihomo = binary("OUTPOST_MIHOMO_BINARY", "mihomo");
const sing = binary("OUTPOST_SING_BOX_BINARY", "sing-box");
const curl = binary("OUTPOST_CURL_BINARY", "curl");
const [proxyPort, mihomoApiPort, singApiPort] = await freePorts(3);
const credentials = [1, 2].map((serial) => ({connectionId: `user-${serial}`, serial, generation: 1,
  hysteria: {id: `user-${serial}`, password: `fixture-password-${serial}`},
  xray: {id: crypto.randomUUID(), email: `user-${serial}.1@outpost.local`}}));
const methods: ConnectionMethod[] = [];
for (const engine of ["mihomo", "sing-box"] as const) {
  for (const protocol of engineCapabilities[engine]) {
    methods.push({id: `${engine}-${protocol}`, engine, protocol, name: `${engine} ${protocol}`, enabled: true, updatedAt: 0,
      settings: {...methodSettings(engine, protocol), port: (await freePorts(1))[0]!}});
  }
}
let arrived: (() => void) | undefined;
const origin = Bun.serve({hostname: "127.0.0.1", port: 0, fetch: () => {
  arrived?.();
  return new Response(new ReadableStream({async start(controller) {
    for (let index = 0; index < 32; index++) {
      controller.enqueue(new Uint8Array(16_384));
      await Bun.sleep(15);
    }
    controller.close();
  }}));
}});

try {
  const certificate = join(directory, "cert.pem"), key = join(directory, "key.pem");
  await command([binary("OUTPOST_OPENSSL_BINARY", "openssl"), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost", "-keyout", key, "-out", certificate]);
  for (const engine of ["mihomo", "sing-box"] as const) {
    const rendered = renderEngine(engine, defaultEngineTemplates[engine], credentials, methods)
      .replace(/\/etc\/letsencrypt\/live\/[^/]+\/fullchain.pem/g, certificate).replace(/\/etc\/letsencrypt\/live\/[^/]+\/privkey.pem/g, key);
    const profile = engine === "mihomo" ? YAML.parse(rendered) : JSON.parse(rendered);
    if (engine === "mihomo") {
      profile["external-controller"] = `127.0.0.1:${mihomoApiPort}`;
      profile.rules.unshift("IP-CIDR,127.0.0.1/32,DIRECT,no-resolve");
      for (const listener of profile.listeners) listener.listen = "127.0.0.1";
    } else {
      profile.services[0].listen_port = singApiPort;
      profile.route.rules.unshift({ip_cidr: ["127.0.0.1/32"], action: "route", outbound: "direct"});
      for (const listener of profile.inbounds) listener.listen = "127.0.0.1";
    }
    const home = join(directory, engine); mkdirSync(home);
    const path = join(home, "config");
    writeFileSync(path, engine === "mihomo" ? YAML.stringify(profile) : JSON.stringify(profile), {mode: 0o600});
    processes.launch(engine === "mihomo" ? [mihomo, "-d", home, "-f", path] : [sing, "run", "-c", path], {SAFE_PATHS: directory});
  }
  await Promise.all([waitForPort(mihomoApiPort!), waitForPort(singApiPort!)]);
  const collectors = {
    mihomo: new MihomoCollector(`http://127.0.0.1:${mihomoApiPort}`),
    "sing-box": new SingBoxCollector(`http://127.0.0.1:${singApiPort}`),
  };
  await collectors["sing-box"].collect(); // Also verifies the zero-connection snapshot.
  for (const method of methods) {
    for (const credential of credentials) {
      const context = {connection: {id: credential.connectionId, serial: credential.serial, name: credential.connectionId},
        credentials: credential, methods: [method], clientProfile: "mihomo-modern", routes: [], subscriptionToken: "fixture",
        enabledEngines: [method.engine], engineOrder: [method.engine]} as unknown as SubscriptionContext;
      const home = join(directory, `${method.id}-${credential.serial}`); mkdirSync(home);
      const path = join(home, "config");
      let client: Bun.Subprocess;
      if (method.protocol === "naive") {
        const proxy = JSON.parse(singBoxRenderer.render({...context, clientProfile: "sing-box-modern"}).body).outbounds[0];
        Object.assign(proxy, {server: "127.0.0.1", server_port: method.settings.port});
        Object.assign(proxy.tls, {server_name: "localhost", certificate_path: certificate});
        writeFileSync(path, JSON.stringify({log: {level: "error"}, inbounds: [{type: "socks", listen: "127.0.0.1", listen_port: proxyPort}], outbounds: [proxy]}), {mode: 0o600});
        client = processes.launch([sing, "run", "-c", path]);
      } else {
        const proxy = YAML.parse(mihomoRenderer.render(context).body).proxies[0];
        Object.assign(proxy, {server: "127.0.0.1", sni: "localhost", servername: "localhost", "skip-cert-verify": true});
        writeFileSync(path, YAML.stringify({"mixed-port": proxyPort, "bind-address": "127.0.0.1", mode: "rule", "log-level": "error",
          proxies: [proxy], rules: [`MATCH,${proxy.name}`]}), {mode: 0o600});
        client = processes.launch([mihomo, "-d", home, "-f", path]);
      }
      await waitForPort(proxyPort!);
      const reached = new Promise<void>((resolve) => {arrived = resolve;});
      const transfer = command([curl, "--noproxy", "", "-fsS", "--max-time", "5", "--socks5-hostname", `127.0.0.1:${proxyPort}`, `http://127.0.0.1:${origin.port}/`]);
      await Promise.race([reached, transfer.then(() => {throw new Error("Request completed without reaching fixture origin");})]);
      const collector = collectors[method.engine as "mihomo" | "sing-box"];
      const snapshot = await collector.collect();
      const points = snapshot.traffic.filter((point) => point.connectionId === credential.connectionId);
      if (!snapshot.online[credential.connectionId] || !points.some((point) => point.upload + point.download > 0)) {
        throw new Error(`${method.name}: user identity, activity or byte counters missing`);
      }
      if (snapshot.traffic.some((point) => !credentials.some((user) => user.connectionId === point.connectionId))) throw new Error("Unexpected user attribution");
      await transfer;
      client.kill(); await client.exited;
    }
    console.log(`${method.name}: two authenticated users attributed, byte counters and online state verified`);
  }
  try {await new SingBoxCollector(`http://127.0.0.1:${singApiPort}`, "invalid-secret").collect(); throw new Error("API accepted invalid secret");}
  catch (error) {if (String(error).includes("accepted")) throw error;}
  console.log("sing-box: API authentication verified; official binary needs no custom build");
} finally {
  await processes.close();
  origin.stop(true);
  rmSync(directory, {recursive: true, force: true});
}
