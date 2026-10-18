import type { ConnectionMethod } from "../../shared/connection-methods";
import type { ConnectionCredential, EngineId } from "../models";
import { config } from "../config";
import { protocolCredential } from "./protocol-credentials";

export function methodListeners(engine: EngineId, methods: readonly ConnectionMethod[], credentials: ConnectionCredential[]) {
  if (!credentials.length) return [];
  const certificate = `/etc/letsencrypt/live/${config.domain}/fullchain.pem`;
  const key = `/etc/letsencrypt/live/${config.domain}/privkey.pem`;
  return methods.filter((method) => method.engine === engine && method.enabled).map((method) => {
    const { protocol, settings, id } = method;
    if (engine === "mihomo") {
      const listener = { name: id, type: protocol === "xhttp" || protocol === "grpc" ? "vless" : protocol,
        listen: "0.0.0.0", port: settings.port, certificate, "private-key": key };
      if (protocol === "anytls") return { ...listener, users: Object.fromEntries(credentials.map((credential) => { const user = protocolCredential(credential, "anytls"); return [user.username, user.password]; })) };
      if (protocol === "trusttunnel") return { ...listener, network: ["tcp"], users: credentials.map((credential) => protocolCredential(credential, "trusttunnel")) };
      if (protocol === "hysteria2") return { ...listener, alpn: ["h3"], users: Object.fromEntries(credentials.map((credential) => [credential.hysteria.id, credential.hysteria.password])) };
      return { ...listener, users: credentials.map((credential) => ({ username: credential.xray.email, uuid: credential.xray.id })),
        ...(protocol === "xhttp" ? { "xhttp-config": { path: settings.path, mode: "auto" } } : { "grpc-service-name": settings.path }) };
    }
    const inbound = { type: protocol === "grpc" ? "vless" : protocol, tag: id, listen: "0.0.0.0", listen_port: settings.port,
      tls: { enabled: true, certificate_path: certificate, key_path: key } };
    if (protocol === "grpc") return { ...inbound, users: credentials.map((credential) => ({ name: credential.xray.email, uuid: credential.xray.id })), transport: { type: "grpc", service_name: settings.path } };
    if (protocol === "hysteria2") return { ...inbound, users: credentials.map((credential) => ({ name: credential.hysteria.id, password: credential.hysteria.password })) };
    return { ...inbound, ...(protocol === "naive" ? { network: "tcp" } : {}), users: credentials.map((credential) => {
      const user = protocolCredential(credential, protocol as "anytls" | "naive");
      return protocol === "anytls" ? { name: user.username, password: user.password } : user;
    }) };
  });
}
