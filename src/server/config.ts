import { join, resolve } from "node:path";
import { version } from "../version";

const production = process.env.NODE_ENV === "production";
const projectRoot = resolve(import.meta.dir, "..", "..");
const dataDir = resolve(process.env.OUTPOST_DATA_DIR ?? (production ? "/var/lib/outpost" : join(projectRoot, ".data")));
const configDir = resolve(process.env.OUTPOST_CONFIG_DIR ?? (production ? "/etc/outpost" : join(projectRoot, ".data", "config")));
const webRoot = resolve(process.env.OUTPOST_WEB_ROOT ?? join(projectRoot, "public"));

const listen = process.env.OUTPOST_LISTEN ?? "127.0.0.1:8181";
const [hostname, rawPort] = listen.split(":");
const domain = process.env.OUTPOST_DOMAIN ?? "localhost";
const adminPath = normalizePath(process.env.OUTPOST_ADMIN_PATH ?? "/admin");

export const config = {
  version: process.env.OUTPOST_VERSION ?? version,
  production,
  demo: process.env.OUTPOST_DEMO === "1",
  setup: process.env.OUTPOST_SETUP === "1",
  dataDir,
  configDir,
  databasePath: join(dataDir, "outpost.sqlite"),
  masterKeyPath: join(dataDir, "master.key"),
  webRoot,
  hostname: hostname || "127.0.0.1",
  port: Number(rawPort || "8181"),
  domain,
  publicIp: process.env.OUTPOST_PUBLIC_IP ?? (isIPv4(domain) ? domain : ""),
  adminPath,
  rpID: process.env.OUTPOST_RP_ID ?? domain,
  origin: process.env.OUTPOST_ORIGIN ?? (domain === "localhost" ? `http://localhost:${rawPort || "8181"}` : `https://${domain}`),
  xhttpPath: normalizePath(process.env.OUTPOST_XHTTP_PATH ?? "/xhttp-change-me"),
  grpcService: normalizeSegment(process.env.OUTPOST_GRPC_SERVICE ?? "grpc-change-me"),
  hysteriaStatsSecret: process.env.OUTPOST_HYSTERIA_STATS_SECRET ?? "development-stats-secret",
  agentSocket: process.env.OUTPOST_AGENT_SOCKET ?? "/run/outpost/agent.sock",
  releasePublicKey: resolve(process.env.OUTPOST_RELEASE_PUBLIC_KEY ?? join(webRoot, "..", "infra/release/minisign.pub")),
  rulesetDir: resolve(process.env.OUTPOST_RULESET_DIR ?? join(dataDir, "rulesets")),
  rulesetIndex: process.env.OUTPOST_RULESET_INDEX
    ?? "https://github.com/Outpost-VPN/outpost-vpn-server/releases/download/rulesets/rulesets.json",
  rulesetPublicKey: process.env.OUTPOST_RULESET_PUBLIC_KEY
    ?? "RWQIi2TPWGnwEuL3XnEdwUYwcd194z3YYWM3sDdZNMhfEPf5xsFAk1FY",
  rulesetCheckHours: 24,
  updateCheckHours: 6,
  sessionHours: 24 * 30,
} as const;

function normalizePath(value: string) {
  const trimmed = value.trim().replace(/\/{2,}/g, "/");
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.length > 1 ? prefixed.replace(/\/$/, "") : prefixed;
}

function normalizeSegment(value: string) {
  const segment = value.trim().replace(/^\/+|\/+$/g, "");
  return /^[a-zA-Z0-9._~-]{8,128}$/.test(segment) ? segment : "grpc-change-me";
}

function isIPv4(value: string) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
