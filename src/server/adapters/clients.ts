import YAML from "yaml";
import type { Device, DeviceCredential, EngineId, RouteRule } from "../models";
import { config } from "../config";

export interface ClientRenderContext {
  device: Device;
  credentials: DeviceCredential;
  routes: RouteRule[];
  subscriptionToken: string;
  engineOrder: readonly EngineId[];
}

export interface RenderedSubscription {
  body: string;
  contentType: string;
  headers: Record<string, string>;
}

export interface ClientAdapter {
  readonly id: "incy" | "mihomo";
  renderSubscription(context: ClientRenderContext): RenderedSubscription;
  renderRoutes(rules: RouteRule[]): { body: string; contentType: string };
  renderDeepLink(url: string): string;
  installationInstructions(): string[];
}

function endpoints(context: ClientRenderContext) {
  const label = encodeURIComponent(`${context.device.person_name ?? "Связь"} · ${context.device.name}`);
  const xhttp = encodeURIComponent(config.xhttpPath);
  return {
    hysteria: `hysteria2://${encodeURIComponent(context.credentials.hysteria.password)}@${config.domain}:443/?sni=${config.domain}&insecure=0#${label}%20Hysteria`,
    vless: `vless://${context.credentials.xray.id}@${config.domain}:443?encryption=none&security=tls&sni=${config.domain}&fp=chrome&type=xhttp&path=${xhttp}&mode=auto#${label}%20VLESS`,
  };
}

function ordered<T>(order: readonly EngineId[], values: Record<EngineId, T>) {
  return order.map((engine) => values[engine]);
}

export const incyAdapter: ClientAdapter = {
  id: "incy",
  renderSubscription(context) {
    const endpoint = endpoints(context);
    const routeUrl = `${config.origin}/routes/${context.subscriptionToken}.json`;
    return {
      body: `${ordered(context.engineOrder, { hysteria: endpoint.hysteria, xray: endpoint.vless }).join("\n")}\n`,
      contentType: "text/plain; charset=utf-8",
      headers: {
        "profile-title": utf8Header(`Связь · ${context.device.name}`),
        "profile-update-interval": "12",
        "profile-web-page-url": config.origin,
        "subscription-userinfo": "upload=0;download=0;total=0;expire=0",
        autorouting: routeUrl,
        "fragmentation-enable": "1",
        "fragmentation-packets": "tlshello",
        "fragmentation-length": "10-30",
        "fragmentation-interval": "10-30",
        ...(context.device.platform === "ios" ? { "no-limit-enabled": "1" } : {}),
        "cache-control": "private, no-store",
      },
    };
  },
  renderRoutes(rules) {
    return {
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(incyRoutingProfile(rules.filter(enabled)), null, 2),
    };
  },
  renderDeepLink(url) {
    return `incy://import/${url}`;
  },
  installationInstructions() {
    return ["Установите INCY из App Store", "Откройте ссылку подписки", "Разрешите автообновление маршрутов"];
  },
};

export const mihomoAdapter: ClientAdapter = {
  id: "mihomo",
  renderSubscription(context) {
    const credential = context.credentials;
    const rules = context.routes.filter(enabled).map(mihomoRule);
    const profile = {
      "mixed-port": 7890,
      "allow-lan": false,
      mode: "rule",
      "log-level": "warning",
      ipv6: false,
      dns: {
        enable: true,
        ipv6: false,
        "enhanced-mode": "fake-ip",
        "fake-ip-filter": ["+.lan", "+.local"],
        nameserver: ["https://1.1.1.1/dns-query", "https://8.8.8.8/dns-query"],
        "direct-nameserver": ["77.88.8.8", "1.1.1.1"],
      },
      proxies: ordered(context.engineOrder, {
        hysteria: {
          name: "Hysteria 2",
          type: "hysteria2",
          server: config.domain,
          port: 443,
          password: credential.hysteria.password,
          sni: config.domain,
          "skip-cert-verify": false,
          alpn: ["h3"],
        },
        xray: {
          name: "VLESS XHTTP",
          type: "vless",
          server: config.domain,
          port: 443,
          uuid: credential.xray.id,
          tls: true,
          servername: config.domain,
          "client-fingerprint": "chrome",
          network: "xhttp",
          "xhttp-opts": { path: config.xhttpPath, mode: "auto" },
        },
      }),
      "proxy-groups": [
        {
          name: "PROXY",
          type: "fallback",
          url: "https://cp.cloudflare.com/generate_204",
          interval: 300,
          proxies: ordered(context.engineOrder, { hysteria: "Hysteria 2", xray: "VLESS XHTTP" }),
        },
      ],
      rules,
    };
    return {
      body: YAML.stringify(profile),
      contentType: "text/yaml; charset=utf-8",
      headers: {
        "profile-title": encodeURIComponent(`Связь · ${context.device.name}`),
        "profile-update-interval": "12",
        "cache-control": "private, no-store",
      },
    };
  },
  renderRoutes(rules) {
    return { body: YAML.stringify({ rules: rules.filter(enabled).map(mihomoRule) }), contentType: "text/yaml; charset=utf-8" };
  },
  renderDeepLink(url) {
    return `mihomo://install-config?url=${encodeURIComponent(url)}`;
  },
  installationInstructions() {
    return ["Откройте клиент Everywhere", "Добавьте подписку по URL", "Включите профиль «Связь»"];
  },
};

export const clients = { incy: incyAdapter, mihomo: mihomoAdapter } as const;

function enabled(rule: RouteRule) {
  return Boolean(rule.enabled);
}

function utf8Header(value: string) {
  return `base64:${Buffer.from(value, "utf8").toString("base64")}`;
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
    Name: "Matreshka",
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
  const types = {
    DOMAIN: "DOMAIN",
    SUFFIX: "DOMAIN-SUFFIX",
    IP_CIDR: "IP-CIDR",
    GEOSITE: "GEOSITE",
    GEOIP: "GEOIP",
  } as const;
  const value = rule.matcher === "SUFFIX" ? rule.value.replace(/^\./, "") : rule.value;
  return `${types[rule.matcher]},${value},${target}`;
}
