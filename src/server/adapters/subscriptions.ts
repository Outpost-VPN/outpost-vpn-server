import YAML from "yaml";
import { config } from "../config";
import type { Connection, ConnectionCredential, EngineId, RouteRule, SubscriptionFormat } from "../models";

export interface SubscriptionContext {
  connection: Connection;
  credentials: ConnectionCredential;
  routes: RouteRule[];
  subscriptionToken: string;
  engineOrder: readonly EngineId[];
  clientPlatform?: string;
}

export interface RenderedSubscription {
  body: string;
  contentType: string;
  headers: Record<string, string>;
}

export interface SubscriptionRenderer {
  readonly id: SubscriptionFormat;
  render(context: SubscriptionContext): RenderedSubscription;
}

export function endpoints(context: SubscriptionContext) {
  const label = encodeURIComponent(context.connection.name);
  const host = config.publicIp || config.domain;
  const xhttp = encodeURIComponent(config.xhttpPath);
  const grpc = encodeURIComponent(config.grpcService);
  return {
    hysteria: `hysteria2://${encodeURIComponent(context.credentials.hysteria.password)}@${host}:443/?sni=${config.domain}&insecure=0#${label}%20Hysteria`,
    xhttp: `vless://${context.credentials.xray.id}@${host}:443?encryption=none&security=tls&sni=${config.domain}&fp=chrome&type=xhttp&path=${xhttp}&mode=packet-up#${label}%20XHTTP`,
    grpc: `vless://${context.credentials.xray.id}@${host}:443?encryption=none&security=tls&sni=${config.domain}&fp=chrome&type=grpc&serviceName=${grpc}&mode=gun#${label}%20gRPC`,
  };
}

export const linksRenderer: SubscriptionRenderer = {
  id: "links",
  render(context) {
    const endpoint = endpoints(context);
    const routeUrl = `${config.origin}/s/${context.subscriptionToken}/routes`;
    return output(`${ordered(context.engineOrder, { hysteria: endpoint.hysteria, xray: [endpoint.xhttp, endpoint.grpc] }).join("\n")}\n`, "text/plain; charset=utf-8", {
      "profile-title": utf8Header(`Outpost · ${context.connection.name}`),
      "profile-update-interval": "12",
      "profile-web-page-url": `${config.origin}/s/${context.subscriptionToken}`,
      "subscription-userinfo": "upload=0;download=0;total=0;expire=0",
      autorouting: routeUrl,
      "fragmentation-enable": "1",
      "fragmentation-packets": "tlshello",
      "fragmentation-length": "10-30",
      "fragmentation-interval": "10-30",
      ...(context.clientPlatform === "ios" ? { "no-limit-enabled": "1" } : {}),
    });
  },
};

export const xrayRenderer: SubscriptionRenderer = {
  id: "xray",
  render(context) {
    const endpoint = endpoints(context);
    return output(Buffer.from(`${endpoint.xhttp}\n${endpoint.grpc}\n`, "utf8").toString("base64"), "text/plain; charset=utf-8", {
      "profile-title": utf8Header(`Outpost · ${context.connection.name}`),
      "profile-update-interval": "12",
    });
  },
};

export const mihomoRenderer: SubscriptionRenderer = {
  id: "mihomo",
  render(context) {
    const host = config.publicIp || config.domain;
    const credential = context.credentials;
    const proxies = ordered<Record<string, unknown>>(context.engineOrder, {
      hysteria: [{
        name: "Hysteria 2",
        type: "hysteria2",
        server: host,
        port: 443,
        password: credential.hysteria.password,
        sni: config.domain,
        "skip-cert-verify": false,
        alpn: ["h3"],
      }],
      xray: [{
        name: "VLESS XHTTP",
        type: "vless",
        server: host,
        port: 443,
        uuid: credential.xray.id,
        udp: true,
        tls: true,
        servername: config.domain,
        "client-fingerprint": "chrome",
        network: "xhttp",
        "xhttp-opts": { path: config.xhttpPath, mode: "packet-up" },
      }, {
        name: "VLESS gRPC",
        type: "vless",
        server: host,
        port: 443,
        uuid: credential.xray.id,
        udp: true,
        tls: true,
        servername: config.domain,
        "client-fingerprint": "chrome",
        network: "grpc",
        "grpc-opts": { "grpc-service-name": config.grpcService },
      }],
    });
    const names = proxies.map((proxy) => proxy.name);
    const profile = {
      "mixed-port": 7890,
      "allow-lan": false,
      mode: "rule",
      "log-level": "warning",
      ipv6: false,
      tun: { "auto-route": false, "auto-detect-interface": false },
      dns: {
        enable: true,
        ipv6: false,
        "enhanced-mode": "fake-ip",
        "fake-ip-filter": ["+.lan", "+.local"],
        "default-nameserver": ["77.88.8.8", "1.1.1.1"],
        "proxy-server-nameserver": ["system", "77.88.8.8"],
        nameserver: ["https://1.1.1.1/dns-query#PROXY", "https://8.8.8.8/dns-query#PROXY"],
        "direct-nameserver": ["system", "77.88.8.8"],
      },
      proxies,
      "proxy-groups": [{ name: "PROXY", type: "fallback", url: "http://1.1.1.1", interval: 300, proxies: names }],
      rules: context.routes.filter(enabled).map(mihomoRule),
    };
    return output(YAML.stringify(profile), "text/yaml; charset=utf-8", {
      "profile-title": encodeURIComponent(`Outpost · ${context.connection.name}`),
      "profile-update-interval": "12",
    });
  },
};

export const singBoxRenderer: SubscriptionRenderer = {
  id: "sing-box",
  render(context) {
    const host = config.publicIp || config.domain;
    const rules = context.routes.filter(enabled);
    const sets = singBoxSets(rules);
    const profile = {
      log: { level: "warn", timestamp: true },
      dns: {
        servers: [
          { type: "local", tag: "local" },
          { type: "https", tag: "remote", server: "1.1.1.1", server_port: 443, path: "/dns-query", detour: "proxy" },
        ],
        strategy: "prefer_ipv4",
      },
      inbounds: [{ type: "tun", tag: "tun-in", address: ["172.19.0.1/30"], auto_route: true, strict_route: true }],
      outbounds: [
        {
          type: "hysteria2",
          tag: "hysteria2",
          server: host,
          server_port: 443,
          password: context.credentials.hysteria.password,
          tls: { enabled: true, server_name: config.domain },
        },
        {
          type: "vless",
          tag: "vless-grpc",
          server: host,
          server_port: 443,
          uuid: context.credentials.xray.id,
          tls: { enabled: true, server_name: config.domain, utls: { enabled: true, fingerprint: "chrome" } },
          transport: { type: "grpc", service_name: config.grpcService },
        },
        {
          type: "urltest",
          tag: "proxy",
          outbounds: singBoxOrder(context.engineOrder),
          url: "https://www.gstatic.com/generate_204",
          interval: "5m",
          tolerance: 50,
        },
        { type: "direct", tag: "direct" },
      ],
      route: {
        auto_detect_interface: true,
        default_domain_resolver: "local",
        rule_set: sets,
        rules: rules.filter((rule) => !(rule.matcher === "SUFFIX" && rule.value === "*")).map(singBoxRule),
        final: catchAll(rules),
      },
    };
    return output(`${JSON.stringify(profile, null, 2)}\n`, "application/json; charset=utf-8");
  },
};

export const xrayJsonRenderer: SubscriptionRenderer = {
  id: "xray-json",
  render(context) {
    const host = config.publicIp || config.domain;
    const outbounds = [
      xrayOutbound("proxy-xhttp", host, context.credentials.xray.id, "xhttp"),
      xrayOutbound("proxy-grpc", host, context.credentials.xray.id, "grpc"),
      { protocol: "freedom", tag: "direct" },
      { protocol: "blackhole", tag: "block" },
    ];
    const profile = {
      log: { loglevel: "warning" },
      dns: { servers: ["1.1.1.1", "8.8.8.8"] },
      inbounds: [
        { listen: "127.0.0.1", port: 10808, protocol: "socks", settings: { udp: true }, tag: "socks" },
        { listen: "127.0.0.1", port: 10809, protocol: "http", settings: {}, tag: "http" },
      ],
      outbounds,
      observatory: { subjectSelector: ["proxy-"], probeUrl: "https://www.gstatic.com/generate_204", probeInterval: "1m" },
      routing: {
        domainStrategy: "IPIfNonMatch",
        balancers: [{ tag: "proxy", selector: ["proxy-"], strategy: { type: "leastPing" } }],
        rules: context.routes.filter(enabled).map(xrayRule),
      },
    };
    return output(`${JSON.stringify(profile, null, 2)}\n`, "application/json; charset=utf-8");
  },
};

export const renderers: Record<SubscriptionFormat, SubscriptionRenderer> = {
  mihomo: mihomoRenderer,
  "sing-box": singBoxRenderer,
  xray: xrayRenderer,
  "xray-json": xrayJsonRenderer,
  links: linksRenderer,
};

export function renderLinkRoutes(rules: RouteRule[]) {
  return {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(incyRoutingProfile(rules.filter(enabled)), null, 2),
  };
}

function output(body: string, contentType: string, headers: Record<string, string> = {}): RenderedSubscription {
  return { body, contentType, headers: { "cache-control": "private, no-store", ...headers } };
}

function ordered<T>(order: readonly EngineId[], values: { hysteria: T | T[]; xray: T | T[] }) {
  return order.flatMap((engine) => {
    const value = values[engine];
    return Array.isArray(value) ? value : [value];
  });
}

function singBoxOrder(order: readonly EngineId[]) {
  return ordered(order, { hysteria: "hysteria2", xray: "vless-grpc" });
}

function enabled(rule: RouteRule) {
  return Boolean(rule.enabled);
}

function utf8Header(value: string) {
  return `base64:${Buffer.from(value, "utf8").toString("base64")}`;
}

function catchAll(rules: RouteRule[]) {
  const rule = rules.find((item) => item.matcher === "SUFFIX" && item.value === "*");
  return rule?.action === "DIRECT" ? "direct" : rule?.action === "BLOCK" ? "block" : "proxy";
}

function incyRoutingProfile(rules: RouteRule[]) {
  const groups = {
    DIRECT: { sites: [] as string[], ips: [] as string[] },
    PROXY: { sites: [] as string[], ips: [] as string[] },
    BLOCK: { sites: [] as string[], ips: [] as string[] },
  };
  for (const rule of rules) {
    if (rule.matcher === "SUFFIX" && rule.value === "*") continue;
    const target = groups[rule.action];
    if (rule.matcher === "IP_CIDR") target.ips.push(rule.value);
    else if (rule.matcher === "GEOIP") target.ips.push(`geoip:${rule.value}`);
    else if (rule.matcher === "GEOSITE") target.sites.push(`geosite:${rule.value}`);
    else if (rule.matcher === "DOMAIN") target.sites.push(`full:${rule.value}`);
    else target.sites.push(`domain:${rule.value.replace(/^\./, "")}`);
  }
  return {
    Name: "Outpost",
    GlobalProxy: "true",
    RemoteDNSType: "DoH",
    RemoteDNSDomain: "https://cloudflare-dns.com/dns-query",
    RemoteDNSIP: "1.1.1.1",
    DomesticDNSType: "DoH",
    DomesticDNSDomain: "https://cloudflare-dns.com/dns-query",
    DomesticDNSIP: "1.1.1.1",
    DirectSites: groups.DIRECT.sites,
    DirectIp: groups.DIRECT.ips,
    ProxySites: groups.PROXY.sites,
    ProxyIp: groups.PROXY.ips,
    BlockSites: groups.BLOCK.sites,
    BlockIp: groups.BLOCK.ips,
    DomainStrategy: "IPIfNonMatch",
    FakeDNS: "false",
    useChunkFiles: true,
  };
}

function mihomoRule(rule: RouteRule) {
  const target = rule.action === "BLOCK" ? "REJECT" : rule.action;
  if (rule.matcher === "SUFFIX" && rule.value === "*") return `MATCH,${target}`;
  const types = { DOMAIN: "DOMAIN", SUFFIX: "DOMAIN-SUFFIX", IP_CIDR: "IP-CIDR", GEOSITE: "GEOSITE", GEOIP: "GEOIP" } as const;
  const value = rule.matcher === "SUFFIX" ? rule.value.replace(/^\./, "") : rule.value;
  return `${types[rule.matcher]},${value},${target}`;
}

function singBoxSets(rules: RouteRule[]) {
  const keys = [...new Set(rules
    .filter((rule) => rule.matcher === "GEOSITE" || rule.matcher === "GEOIP")
    .map((rule) => `${rule.matcher.toLowerCase()}:${rule.value.toLowerCase()}`))];
  return keys.map((key) => {
    const [family, code] = key.split(":") as ["geosite" | "geoip", string];
    return {
      type: "remote",
      tag: `${family}-${code}`,
      format: "binary",
      url: `${config.origin}/rulesets/${family}/${encodeURIComponent(code)}.srs`,
      download_detour: "direct",
      update_interval: "1d",
    };
  });
}

function singBoxRule(rule: RouteRule) {
  const match = rule.matcher === "DOMAIN" ? { domain: [rule.value] }
    : rule.matcher === "SUFFIX" ? { domain_suffix: [rule.value.replace(/^\./, "")] }
      : rule.matcher === "IP_CIDR" ? { ip_cidr: [rule.value] }
        : { rule_set: [`${rule.matcher.toLowerCase()}-${rule.value.toLowerCase()}`] };
  if (rule.action === "BLOCK") return { ...match, action: "reject" };
  return { ...match, action: "route", outbound: rule.action === "DIRECT" ? "direct" : "proxy" };
}

function xrayOutbound(tag: string, host: string, id: string, network: "xhttp" | "grpc") {
  return {
    protocol: "vless",
    tag,
    settings: { vnext: [{ address: host, port: 443, users: [{ id, encryption: "none" }] }] },
    streamSettings: {
      network,
      security: "tls",
      tlsSettings: { serverName: config.domain, fingerprint: "chrome" },
      ...(network === "xhttp"
        ? { xhttpSettings: { path: config.xhttpPath, mode: "packet-up" } }
        : { grpcSettings: { serviceName: config.grpcService, multiMode: false } }),
    },
  };
}

function xrayRule(rule: RouteRule) {
  const target = rule.action === "PROXY" ? { balancerTag: "proxy" }
    : { outboundTag: rule.action === "DIRECT" ? "direct" : "block" };
  if (rule.matcher === "SUFFIX" && rule.value === "*") return { type: "field", network: "tcp,udp", ...target };
  if (rule.matcher === "IP_CIDR") return { type: "field", ip: [rule.value], ...target };
  if (rule.matcher === "GEOIP") return { type: "field", ip: [`geoip:${rule.value}`], ...target };
  const domain = rule.matcher === "DOMAIN" ? `full:${rule.value}`
    : rule.matcher === "GEOSITE" ? `geosite:${rule.value}`
      : `domain:${rule.value.replace(/^\./, "")}`;
  return { type: "field", domain: [domain], ...target };
}
