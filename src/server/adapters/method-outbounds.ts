import { compatibleMethods, defaultMethods, clientProfileFormat, type ClientProfile, type ConnectionMethod } from "../../shared/connection-methods";
import type { SubscriptionFormat } from "../models";
import type { SubscriptionContext } from "./subscriptions";
import { config } from "../config";
import { protocolCredential } from "./protocol-credentials";
import { amneziaProxy } from "./amneziawg";
import { ServiceError } from "../services/connections";

export function subscriptionMethods(context: SubscriptionContext, format: SubscriptionFormat) {
  const profile = context.clientProfile ?? (context.protocols && format === "mihomo" ? "mihomo-modern" : context.protocols && format === "sing-box" ? "sing-box-modern" : format);
  if (clientProfileFormat(profile) !== format) throw new ServiceError(400, "Client profile does not match the subscription format");
  const methods = context.methods ?? defaultMethods(context.engineOrder, { xhttp: config.xhttpPath, grpc: config.grpcService });
  const selected = compatibleMethods(methods, profile as ClientProfile, context.enabledEngines ?? ["hysteria", "xray"])
    .filter((method) => !context.protocols || context.protocols.includes(method.protocol));
  if (!selected.length) throw new ServiceError(409, "No enabled connection methods are compatible with this client profile");
  return selected;
}

function tag(method: ConnectionMethod) {
  if (method.id === `${method.engine}-${method.protocol}`) return method.protocol === "grpc" ? "vless-grpc" : method.protocol;
  return `method-${method.id}`;
}

export function methodLink(method: ConnectionMethod, context: SubscriptionContext) {
  const host = config.publicIp || config.domain;
  const { protocol, settings } = method;
  const legacy = method.id === `${method.engine}-${protocol}`;
  const suffix = protocol === "hysteria2" ? "Hysteria" : protocol === "xhttp" ? "XHTTP" : "gRPC";
  const label = encodeURIComponent(legacy ? `${context.connection.name} ${suffix}` : `${context.connection.name} · ${method.name}`);
  if (protocol === "hysteria2") return `hysteria2://${encodeURIComponent(context.credentials.hysteria.password)}@${host}:${settings.port}/?sni=${config.domain}&insecure=0#${label}`;
  return `vless://${context.credentials.xray.id}@${host}:${settings.port}?encryption=none&security=tls&sni=${config.domain}&fp=${settings.fingerprint ?? "chrome"}&type=${protocol}&${protocol === "xhttp" ? `path=${encodeURIComponent(settings.path!)}&mode=packet-up` : `serviceName=${encodeURIComponent(settings.path!)}&mode=gun`}#${label}`;
}

export function mihomoOutbound(method: ConnectionMethod, context: SubscriptionContext): Record<string, unknown> {
  const host = config.publicIp || config.domain;
  const { protocol, settings } = method;
  const credential = context.credentials;
  if (protocol === "hysteria2") return { name: method.name, type: "hysteria2", server: host, port: settings.port,
    password: credential.hysteria.password, sni: config.domain, "skip-cert-verify": false, alpn: ["h3"] };
  if (protocol === "xhttp" || protocol === "grpc") return { name: method.name, type: "vless", server: host, port: settings.port,
    uuid: credential.xray.id, udp: true, tls: true, servername: config.domain, "client-fingerprint": settings.fingerprint ?? "chrome", network: protocol,
    ...(protocol === "xhttp" ? { "xhttp-opts": { path: settings.path, mode: "packet-up" } } : { "grpc-opts": { "grpc-service-name": settings.path } }) };
  if (protocol === "amneziawg") return { ...amneziaProxy(credential, context.connection.serial, host), name: method.name, port: settings.port };
  const user = protocolCredential(credential, protocol as "anytls" | "trusttunnel");
  return { name: method.name, type: protocol, server: host, port: settings.port,
    ...(protocol === "anytls" ? { password: user.password } : user), sni: config.domain, "skip-cert-verify": false,
    "client-fingerprint": settings.fingerprint ?? "chrome", udp: true, ...(protocol === "trusttunnel" ? { quic: false } : {}) };
}

export function singBoxOutbound(method: ConnectionMethod, context: SubscriptionContext) {
  const { protocol, settings } = method;
  const base = { type: protocol === "grpc" ? "vless" : protocol, tag: tag(method), server: config.publicIp || config.domain, server_port: settings.port };
  const tls = { enabled: true, server_name: config.domain };
  const fingerprint = settings.fingerprint ?? "chrome";
  const secure = { ...tls, ...(fingerprint !== "none" ? { utls: { enabled: true, fingerprint } } : {}) };
  if (protocol === "hysteria2") return { ...base, password: context.credentials.hysteria.password, tls };
  if (protocol === "grpc") return { ...base, uuid: context.credentials.xray.id, tls: secure, transport: { type: "grpc", service_name: settings.path } };
  const user = protocolCredential(context.credentials, protocol as "anytls" | "naive");
  return { ...base, ...(protocol === "anytls" ? { password: user.password } : user), tls: protocol === "anytls" ? secure : tls };
}

export function xrayMethodOutbound(method: ConnectionMethod, context: SubscriptionContext) {
  const { protocol, settings } = method;
  const suffix = method.id === `xray-${protocol}` ? protocol : method.id;
  return { protocol: "vless", tag: `proxy-${suffix}`,
    settings: { vnext: [{ address: config.publicIp || config.domain, port: settings.port, users: [{ id: context.credentials.xray.id, encryption: "none" }] }] },
    streamSettings: { network: protocol, security: "tls", tlsSettings: { serverName: config.domain, ...(settings.fingerprint !== "none" ? { fingerprint: settings.fingerprint ?? "chrome" } : {}) },
      ...(protocol === "xhttp" ? { xhttpSettings: { path: settings.path, mode: "packet-up" } } : { grpcSettings: { serviceName: settings.path, multiMode: false } }) } };
}
