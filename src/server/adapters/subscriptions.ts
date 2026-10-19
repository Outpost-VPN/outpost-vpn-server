import { subscriptionMethods, methodLink, mihomoOutbound, singBoxOutbound, xrayMethodOutbound } from "./method-outbounds";
import type { ConnectionMethod, ClientProfile } from "../../shared/connection-methods";
import { amneziaClient } from "./amneziawg";
import { type ProtocolId } from "../../shared/protocols";
import { protocolCredential } from "./protocol-credentials";
import YAML from "yaml";
import { networkDefaults, type NetworkSettings } from "../../shared/settings";
import { config } from "../config";
import type { ClientRouteRule, Connection, ConnectionCredential, EngineId, SubscriptionFormat } from "../models";

export interface SubscriptionContext {
  methods?: readonly ConnectionMethod[];
  clientProfile?: ClientProfile;
  connection: Connection;
  credentials: ConnectionCredential;
  routes: ClientRouteRule[];
  subscriptionToken: string;
  engineOrder?: readonly EngineId[];
  clientPlatform?: string;
  protocols?: readonly ProtocolId[];
  enabledEngines?: readonly EngineId[];
  network?: NetworkSettings;
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

export const naiveRenderer: SubscriptionRenderer = {
  id: "naive",
  render(context) {
    const method = subscriptionMethods(context, "naive")[0]!;
    const user = protocolCredential(context.credentials, "naive");
    return output(JSON.stringify({ listen: "socks://127.0.0.1:1080",
      proxy: `https://${encodeURIComponent(user.username)}:${encodeURIComponent(user.password)}@${config.domain}:${method.settings.port}`,
    }, null, 2) + "\n", "application/json; charset=utf-8");
  },
};

const MIHOMO_QUIC_REJECT_RULE = "AND,((NETWORK,UDP),(DST-PORT,443)),REJECT";
const MIHOMO_IPV6_REJECT_RULE = "IP-CIDR6,::/0,REJECT,no-resolve";
const SING_BOX_QUIC_REJECT_RULE = { network: "udp", port: 443, action: "reject" } as const;
const SING_BOX_IPV6_REJECT_RULE = { ip_version: 6, action: "reject" } as const;
const XRAY_QUIC_REJECT_RULE = { type: "field", network: "udp", port: 443, outboundTag: "block" } as const;
const XRAY_IPV6_REJECT_RULE = { type: "field", ip: ["::/0"], outboundTag: "block" } as const;

export const linksRenderer: SubscriptionRenderer = {
  id: "links",
  render(context) {
    const methods = subscriptionMethods(context, "links");
    const routeUrl = `${config.origin}/s/${context.subscriptionToken}/routes`;
    return output(`${methods.map((method) => methodLink(method, context)).join("\n")}\n`, "text/plain; charset=utf-8", {
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

export const mihomoRenderer: SubscriptionRenderer = {
  id: "mihomo",
  render(context) {
    const network = context.network ?? networkDefaults;
    const rules = context.routes.filter(enabled);
    const proxies = subscriptionMethods(context, "mihomo").map((method) => mihomoOutbound(method, context));
    const names = proxies.map((proxy) => proxy.name);
    const profile = {
      "mixed-port": 7890,
      "allow-lan": false,
      mode: "rule",
      "log-level": "warning",
      ipv6: network.ipv6,
      tun: { "auto-route": false, "auto-detect-interface": false },
      dns: {
        enable: true,
        ipv6: network.ipv6,
        "enhanced-mode": network.mihomo.dnsMode,
        "fake-ip-filter": ["+.lan", "+.local"],
        "default-nameserver": ["77.88.8.8", "1.1.1.1"],
        "proxy-server-nameserver": ["system", "77.88.8.8"],
        nameserver: ["https://1.1.1.1/dns-query#PROXY", "https://8.8.8.8/dns-query#PROXY"],
        "direct-nameserver": ["system", "77.88.8.8"],
      },
      sniffer: {
        enable: network.mihomo.sniffing,
        "force-dns-mapping": true,
        "parse-pure-ip": true,
        "override-destination": true,
        sniff: {
          HTTP: { ports: network.mihomo.httpPorts, "override-destination": true },
          TLS: { ports: network.mihomo.tlsPorts },
          QUIC: { ports: network.mihomo.quicPorts },
        },
      },
      proxies,
      "proxy-groups": [{ name: "PROXY", type: "fallback", url: "http://1.1.1.1", interval: 300, proxies: names }],
      rules: [
        ...rules.filter((rule) => !isCatchAll(rule)).map(mihomoRule),
        ...(!network.ipv6 ? [MIHOMO_IPV6_REJECT_RULE] : []),
        ...(network.blockQuic ? [MIHOMO_QUIC_REJECT_RULE] : []),
        ...rules.filter(isCatchAll).map(mihomoRule),
      ],
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
    const network = context.network ?? networkDefaults;
    const host = config.publicIp || config.domain;
    const rules = context.routes.filter(enabled);
    const sets = singBoxSets(rules);
    const transports = subscriptionMethods(context, "sing-box").map((method) => singBoxOutbound(method, context));
    const profile = {
      log: { level: "warn", timestamp: true },
      dns: {
        servers: [
          { type: "local", tag: "local" },
          { type: "https", tag: "remote", server: "1.1.1.1", server_port: 443, path: "/dns-query", detour: "proxy" },
        ],
        strategy: "prefer_ipv4",
      },
      inbounds: [{ type: "tun", tag: "tun-in", address: network.ipv6 ? ["172.19.0.1/30", "fdfe:dcba:9876::1/126"] : ["172.19.0.1/30"], auto_route: true, strict_route: true }],
      outbounds: [
        ...transports,
        {
          type: "urltest",
          tag: "proxy",
          outbounds: transports.map((transport) => transport.tag),
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
        rules: [
          ...rules.filter((rule) => !isCatchAll(rule)).map(singBoxRule),
          ...(!network.ipv6 ? [SING_BOX_IPV6_REJECT_RULE] : []),
          ...(network.blockQuic ? [SING_BOX_QUIC_REJECT_RULE] : []),
        ],
        final: catchAll(rules),
      },
    };
    return output(`${JSON.stringify(profile, null, 2)}\n`, "application/json; charset=utf-8");
  },
};

export const xrayJsonRenderer: SubscriptionRenderer = {
  id: "xray-json",
  render(context) {
    const network = context.network ?? networkDefaults;
    const host = config.publicIp || config.domain;
    const rules = context.routes.filter(enabled);
    const outbounds = [
      ...subscriptionMethods(context, "xray-json").map((method) => xrayMethodOutbound(method, context)),
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
        rules: [
          ...rules.filter((rule) => !isCatchAll(rule)).map(xrayRule),
          ...(!network.ipv6 ? [XRAY_IPV6_REJECT_RULE] : []),
          ...(network.blockQuic ? [XRAY_QUIC_REJECT_RULE] : []),
          ...rules.filter(isCatchAll).map(xrayRule),
        ],
      },
    };
    return output(`${JSON.stringify(profile, null, 2)}\n`, "application/json; charset=utf-8");
  },
};

export const renderers: Record<SubscriptionFormat, SubscriptionRenderer> = {
  mihomo: mihomoRenderer,
  "sing-box": singBoxRenderer,
  "xray-json": xrayJsonRenderer,
  naive: naiveRenderer,
  amneziawg: { id: "amneziawg", render(context) {
    const method = subscriptionMethods(context, "amneziawg")[0]!;
    return output(amneziaClient(context.credentials, context.connection.serial, config.publicIp || config.domain, undefined, method.settings.port), "text/plain; charset=utf-8", { "content-disposition": "attachment; filename=outpost-amneziawg.conf" });
  } },
  links: linksRenderer,
};

export function renderLinkRoutes(rules: ClientRouteRule[], network = networkDefaults) {
  return {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(incyRoutingProfile(rules.filter(enabled), network), null, 2),
  };
}

function output(body: string, contentType: string, headers: Record<string, string> = {}): RenderedSubscription {
  return { body, contentType, headers: { "cache-control": "private, no-store", ...headers } };
}

function enabled(rule: ClientRouteRule) {
  return Boolean(rule.enabled);
}

function isCatchAll(rule: ClientRouteRule) {
  return rule.matcher === "SUFFIX" && rule.value === "*";
}

function utf8Header(value: string) {
  return `base64:${Buffer.from(value, "utf8").toString("base64")}`;
}

function catchAll(rules: ClientRouteRule[]) {
  const rule = rules.find((item) => item.matcher === "SUFFIX" && item.value === "*");
  return rule?.action === "DIRECT" ? "direct" : rule?.action === "BLOCK" ? "block" : "proxy";
}

function incyRoutingProfile(rules: ClientRouteRule[], network: NetworkSettings) {
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
    else if (rule.matcher === "DOMAIN") target.sites.push(`full:${rule.value}`);
    else if (rule.matcher === "DOMAIN_KEYWORD") target.sites.push(rule.value);
    else if (rule.matcher === "DOMAIN_REGEX") target.sites.push(`regexp:${rule.value}`);
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
    BlockIp: [...groups.BLOCK.ips, ...(!network.ipv6 ? ["::/0"] : [])],
    DomainStrategy: "IPIfNonMatch",
    FakeDNS: "false",
    useChunkFiles: true,
  };
}

function mihomoRule(rule: ClientRouteRule) {
  const target = rule.action === "BLOCK" ? "REJECT" : rule.action;
  if (rule.matcher === "SUFFIX" && rule.value === "*") return `MATCH,${target}`;
  const types = {
    DOMAIN: "DOMAIN",
    SUFFIX: "DOMAIN-SUFFIX",
    DOMAIN_KEYWORD: "DOMAIN-KEYWORD",
    DOMAIN_REGEX: "DOMAIN-REGEX",
    IP_CIDR: "IP-CIDR",
    GEOIP: "GEOIP",
  } as const;
  const value = rule.matcher === "SUFFIX" ? rule.value.replace(/^\./, "") : rule.value;
  const type = rule.matcher === "IP_CIDR" && value.includes(":") ? "IP-CIDR6" : types[rule.matcher];
  return `${type},${value},${target}`;
}

function singBoxSets(rules: ClientRouteRule[]) {
  const keys = [...new Set(rules
    .filter((rule) => rule.matcher === "GEOIP")
    .map((rule) => `geoip:${rule.value.toLowerCase()}`))];
  return keys.map((key) => {
    const family = "geoip";
    const code = key.slice("geoip:".length);
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

function singBoxRule(rule: ClientRouteRule) {
  const match = rule.matcher === "DOMAIN" ? { domain: [rule.value] }
    : rule.matcher === "SUFFIX" ? { domain_suffix: [rule.value.replace(/^\./, "")] }
      : rule.matcher === "DOMAIN_KEYWORD" ? { domain_keyword: [rule.value] }
        : rule.matcher === "DOMAIN_REGEX" ? { domain_regex: [rule.value] }
          : rule.matcher === "IP_CIDR" ? { ip_cidr: [rule.value] }
          : { rule_set: [`geoip-${rule.value.toLowerCase()}`] };
  if (rule.action === "BLOCK") return { ...match, action: "reject" };
  return { ...match, action: "route", outbound: rule.action === "DIRECT" ? "direct" : "proxy" };
}

function xrayRule(rule: ClientRouteRule) {
  const target = rule.action === "PROXY" ? { balancerTag: "proxy" }
    : { outboundTag: rule.action === "DIRECT" ? "direct" : "block" };
  if (rule.matcher === "SUFFIX" && rule.value === "*") return { type: "field", network: "tcp,udp", ...target };
  if (rule.matcher === "IP_CIDR") return { type: "field", ip: [rule.value], ...target };
  if (rule.matcher === "GEOIP") return { type: "field", ip: [`geoip:${rule.value}`], ...target };
  const domain = rule.matcher === "DOMAIN" ? `full:${rule.value}`
    : rule.matcher === "DOMAIN_KEYWORD" ? rule.value
      : rule.matcher === "DOMAIN_REGEX" ? `regexp:${rule.value}`
        : `domain:${rule.value.replace(/^\./, "")}`;
  return { type: "field", domain: [domain], ...target };
}
