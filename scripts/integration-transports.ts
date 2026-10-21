import { binary, command, expectBody, waitForPort, freePorts, listen, ProcessGroup } from "./lib/native-integration";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { config } from "../src/server/config";
import { mihomoRenderer, type SubscriptionContext } from "../src/server/adapters/subscriptions";

const root = resolve(import.meta.dir, "..");
const directory = mkdtempSync(join(tmpdir(), "outpost-transport-integration-"));
const processes = new ProcessGroup();
const launch = processes.launch.bind(processes);
const uuid = "f8e5bb4d-483a-4f57-b2fe-cda0d799cb83";
const xhttpPath = "/xhttp-integration-secret";
const grpcService = "grpc-integration-secret";
const xray = binary("OUTPOST_XRAY_BINARY", "xray");
const mihomo = binary("OUTPOST_MIHOMO_BINARY", "mihomo");
const nginx = binary("OUTPOST_NGINX_BINARY", "nginx");
const curl = binary("OUTPOST_CURL_BINARY", "curl");
const openssl = binary("OUTPOST_OPENSSL_BINARY", "openssl");
const body = "Outpost transport integration\n";
const origin = createServer((request, response) => {
  const hash = createHash("sha256");
  let received = 0;
  request.on("data", (chunk: Buffer) => {
    received += chunk.length;
    hash.update(chunk);
  });
  request.on("end", () => {
    response.setHeader("Content-Type", "text/plain");
    response.end(request.method === "POST" ? `Uploaded ${received} bytes: ${hash.digest("hex")}\n` : body);
  });
});
const originPort = await listen(origin);

const [edgePort, xhttpPort, grpcPort, xhttpSocksPort, grpcSocksPort, mihomoPort, deadUdpPort] = await freePorts(7) as [number, number, number, number, number, number, number];

try {
  const authority = join(directory, "authority.pem");
  const authorityKey = join(directory, "authority-key.pem");
  const certificate = join(directory, "certificate.pem");
  const key = join(directory, "key.pem");
  await command([
    openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=Outpost Integration CA", "-addext", "basicConstraints=critical,CA:TRUE",
    "-keyout", authorityKey, "-out", authority,
  ]);
  const request = join(directory, "certificate.csr");
  await command([openssl, "req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost", "-keyout", key, "-out", request]);
  const extensions = join(directory, "certificate.ext");
  writeFileSync(extensions, "basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:localhost\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n");
  await command([
    openssl, "x509", "-req", "-in", request, "-CA", authority, "-CAkey", authorityKey,
    "-CAcreateserial", "-days", "1", "-extfile", extensions, "-out", certificate,
  ]);
  const serverConfig = join(directory, "xray-server.json");
  writeFileSync(serverConfig, JSON.stringify({
    log: { loglevel: "warning" },
    inbounds: [
      {
        tag: "vless-xhttp", listen: "127.0.0.1", port: xhttpPort, protocol: "vless",
        settings: { clients: [{ id: uuid, email: "integration@outpost.local" }], decryption: "none" },
        streamSettings: { network: "xhttp", xhttpSettings: { path: xhttpPath, mode: "auto" } },
      },
      {
        tag: "vless-grpc", listen: "127.0.0.1", port: grpcPort, protocol: "vless",
        settings: { clients: [{ id: uuid, email: "integration@outpost.local" }], decryption: "none" },
        streamSettings: { network: "grpc", grpcSettings: { serviceName: grpcService } },
      },
    ],
    // Xray blocks private VLESS destinations by default; allow only this isolated test origin.
    outbounds: [{
      protocol: "freedom",
      tag: "direct",
      settings: { finalRules: [{ action: "allow", network: "tcp", port: String(originPort), ip: ["127.0.0.1"] }] },
    }],
  }, null, 2));
  launch([xray, "run", "-config", serverConfig]);
  await Promise.all([waitForPort(xhttpPort), waitForPort(grpcPort)]);

  const nginxConfig = join(directory, "nginx.conf");
  const template = readFileSync(join(root, "infra/nginx/outpost.conf.template"), "utf8");
  const grpcLocation = template.match(/    location \^~ \/__GRPC_SERVICE__\/ \{[\s\S]*?\n    \}/)?.[0];
  if (!grpcLocation) throw new Error("Production gRPC location not found");
  writeFileSync(nginxConfig, `
daemon off;
pid ${join(directory, "nginx.pid")};
error_log stderr notice;
events {}
http {
  access_log off;
  server {
    listen 127.0.0.1:${edgePort} ssl http2;
    server_name localhost;
    ssl_certificate ${certificate};
    ssl_certificate_key ${key};
    location ${xhttpPath} {
      proxy_pass http://127.0.0.1:${xhttpPort};
      proxy_http_version 1.1;
      proxy_buffering off;
      proxy_request_buffering off;
    }
${grpcLocation.replaceAll("__GRPC_SERVICE__", grpcService).replaceAll("__DOMAIN__", "localhost").replace("127.0.0.1:10001", `127.0.0.1:${grpcPort}`)}
  }
}
`);
  launch([nginx, "-p", directory, "-c", nginxConfig]);
  await waitForPort(edgePort);

  const only = process.env.OUTPOST_INTEGRATION_ONLY;
  if (!only || only === "xhttp") await verifyXrayTransport("xhttp", xhttpSocksPort, edgePort, authority);
  if (!only || only === "grpc") await verifyXrayTransport("grpc", grpcSocksPort, edgePort, authority);
  if (!only || only === "fallback") await verifyMihomoFallback(edgePort, mihomoPort, deadUdpPort);
  console.log(`Transport integration passed through one TLS edge on TCP/${edgePort}`);
} finally {
  await processes.close();
  await new Promise<void>((resolve) => origin.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
}

async function verifyXrayTransport(
  network: "xhttp" | "grpc",
  socksPort: number,
  serverPort: number,
  authority: string,
) {
  const clientConfig = join(directory, `xray-client-${network}.json`);
  writeFileSync(clientConfig, JSON.stringify({
    log: { loglevel: "warning" },
    inbounds: [{ listen: "127.0.0.1", port: socksPort, protocol: "socks", settings: { udp: true } }],
    outbounds: [{
      protocol: "vless",
      settings: { vnext: [{ address: "127.0.0.1", port: serverPort, users: [{ id: uuid, encryption: "none" }] }] },
      streamSettings: {
        network,
        security: "tls",
        tlsSettings: {
          serverName: "localhost",
          fingerprint: "unsafe",
          disableSystemRoot: true,
          certificates: [{ certificateFile: authority, usage: "verify" }],
        },
        ...(network === "xhttp"
          ? { xhttpSettings: { path: xhttpPath, mode: "packet-up" } }
          : { grpcSettings: { serviceName: grpcService } }),
      },
    }],
  }, null, 2));
  const child = launch([xray, "run", "-config", clientConfig]);
  await waitForPort(socksPort);
  await expectBody([curl, "--noproxy", "", "--silent", "--show-error", "--fail", "--max-time", "8", "--socks5-hostname", `127.0.0.1:${socksPort}`, `http://127.0.0.1:${originPort}/`], "Outpost transport integration");
  if (network === "grpc") {
    const payload = Buffer.alloc(2 * 1024 * 1024, 0x5a);
    const upload = join(directory, "grpc-upload.bin");
    writeFileSync(upload, payload);
    const digest = createHash("sha256").update(payload).digest("hex");
    await expectBody([
      curl, "--noproxy", "", "--silent", "--show-error", "--fail", "--max-time", "8",
      "--socks5-hostname", `127.0.0.1:${socksPort}`, "--header", "Expect:",
      "--data-binary", `@${upload}`, `http://127.0.0.1:${originPort}/upload`,
    ], `Uploaded ${payload.length} bytes: ${digest}`, 1);
  }
  child.kill();
  await child.exited;
}

async function verifyMihomoFallback(
  serverPort: number,
  mixedPort: number,
  unavailablePort: number,
) {
  const context: SubscriptionContext = {
    connection: {
      id: "integration", serial: 1, name: "Integration", color: "blue", avatar: "avatar-person",
      status: "active", generation: 1, created_at: "", updated_at: "", activated_at: "", first_used_at: null,
      last_fetched_at: null, first_seen_at: null, last_seen_at: null, absence_notified_at: null, suspended_at: null, archived_at: null,
    },
    credentials: {
      connectionId: "integration",
      generation: 1,
      hysteria: { id: "integration", password: "unavailable-hysteria" },
      xray: { id: uuid, email: "integration.1@outpost.local" },
    },
    routes: [{
      id: "fallback", position: 0, action: "PROXY", matcher: "SUFFIX", value: "*", source: "system", locked: true,
      enabled: true, created_at: "", updated_at: "",
    }],
    subscriptionToken: "integration-token",
    engineOrder: ["hysteria", "xray"],
  };
  const mutable = config as unknown as { publicIp: string; domain: string; xhttpPath: string; grpcService: string };
  const previous = { publicIp: mutable.publicIp, domain: mutable.domain, xhttpPath: mutable.xhttpPath, grpcService: mutable.grpcService };
  Object.assign(mutable, { publicIp: "127.0.0.1", domain: "localhost", xhttpPath, grpcService });
  const profile = YAML.parse(mihomoRenderer.render(context).body);
  Object.assign(mutable, previous);
  profile["mixed-port"] = mixedPort;
  profile["proxy-groups"][0].url = `http://127.0.0.1:${originPort}/`;
  profile["proxy-groups"][0].interval = 3;
  profile.rules = ["MATCH,PROXY"];
  for (const proxy of profile.proxies) {
    proxy.server = "127.0.0.1";
    proxy.port = proxy.type === "hysteria2" ? unavailablePort : serverPort;
    if (proxy.type === "hysteria2") proxy.sni = "localhost";
    else proxy.servername = "localhost";
    proxy["skip-cert-verify"] = true;
  }
  const home = join(directory, "mihomo-home");
  mkdirSync(home);
  const profilePath = join(directory, "mihomo.yaml");
  writeFileSync(profilePath, YAML.stringify(profile));
  const child = launch([mihomo, "-d", home, "-f", profilePath]);
  await waitForPort(mixedPort);
  await expectBody([curl, "--noproxy", "", "--silent", "--show-error", "--fail", "--max-time", "8", "--proxy", `http://127.0.0.1:${mixedPort}`, `http://127.0.0.1:${originPort}/`], "Outpost transport integration", 30);
  child.kill();
  await child.exited;
}
