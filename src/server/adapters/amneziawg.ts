import { protocols } from "../../shared/protocols";
import { createHmac, createPrivateKey, createPublicKey } from "node:crypto";
import { z } from "zod";
import { deriveToken } from "../security";
import type { ConnectionCredential } from "../models";

const key = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);
const snapshotSchema = z.object({
  listenPort: z.number().int().min(0).max(65535).optional(),
  server: z.object({ privateKey: key, headerProtectionKey: key }).strict(),
  peers: z.array(z.object({ publicKey: key, presharedKey: key,
    address: z.string().regex(/^10\.78\.(?:\d{1,3})\.(?:\d{1,3})\/32$/),
  }).strict()),
}).strict();
export type AmneziaSnapshot = z.infer<typeof snapshotSchema>;

function privateKey(bytes: Buffer) {
  const value = Buffer.from(bytes);
  value[0] = value[0]! & 248;
  value[31] = (value[31]! & 127) | 64;
  return value.toString("base64");
}

export function publicKey(secret: string) {
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b656e04220420", "hex"), Buffer.from(secret, "base64")]);
  return createPublicKey(createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" }))
    .export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
}

export function amneziaIdentity() {
  return {
    privateKey: privateKey(Buffer.from(deriveToken("outpost:awg:private:v1", "server"), "base64url")),
    headerProtectionKey: Buffer.from(deriveToken("outpost:awg:header:v1", "server"), "base64url").toString("base64"),
  };
}

export function amneziaPeer(credential: ConnectionCredential, serial = credential.serial) {
  if (!Number.isInteger(serial) || serial! < 1 || serial! > 65532) throw new Error("AmneziaWG address capacity exceeded");
  const derive = (purpose: string) => createHmac("sha256", credential.hysteria.password)
    .update(`outpost:awg:${purpose}:v1\0${credential.connectionId}\0${credential.generation}`).digest();
  const secret = privateKey(derive("private"));
  const address = serial! + 1;
  return { privateKey: secret, publicKey: publicKey(secret), presharedKey: derive("preshared").toString("base64"),
    address: `10.78.${address >> 8}.${address & 255}/32` };
}

export function amneziaSnapshot(credentials: ConnectionCredential[], server = amneziaIdentity()): AmneziaSnapshot {
  return { server, peers: credentials.map((credential) => {
    const { privateKey: _private, ...peer } = amneziaPeer(credential);
    return peer;
  }) };
}

export function amneziaOptions(headerKey: string) {
  return { jc: 4, jmin: 64, jmax: 1024, s1: 32, s2: 48, s3: 24, s4: 16,
    h1: "100000-199999", h2: "200000-299999", h3: "300000-399999", h4: "400000-499999",
    "header-protection-key": headerKey, "content-padding-addition": "0-256", "random-trailers": true, "disable-cookies": true };
}

function obfuscation(headerKey: string) {
  return Object.entries(amneziaOptions(headerKey)).map(([key, value]) => {
    const name = key.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
    return `${name} = ${typeof value === "boolean" ? value ? "on" : "off" : value}`;
  });
}

export function amneziaProxy(credential: ConnectionCredential, serial: number, host: string, server = amneziaIdentity()) {
  const peer = amneziaPeer(credential, serial);
  return { name: "AmneziaWG 3.1", type: "wireguard", server: host, port: protocols.amneziawg.port,
    ip: peer.address.split("/")[0], "private-key": peer.privateKey, "public-key": publicKey(server.privateKey),
    "pre-shared-key": peer.presharedKey, udp: true, mtu: 1280, "persistent-keepalive": 25,
    "amnezia-wg-option": { version: 3, ...amneziaOptions(server.headerProtectionKey) } };
}

export function amneziaNative(value: unknown) {
  const snapshot = snapshotSchema.parse(value);
  const addresses = new Set<string>();
  const keys = new Set<string>();
  for (const peer of snapshot.peers) {
    const parts = peer.address.split("/")[0]!.split(".").map(Number);
    if (parts.some((part) => part > 255) || (parts[2] === 0 && parts[3]! < 2) || addresses.has(peer.address) || keys.has(peer.publicKey)) throw new Error("Invalid or duplicate AmneziaWG peer");
    addresses.add(peer.address); keys.add(peer.publicKey);
  }
  return ["[Interface]", `PrivateKey = ${snapshot.server.privateKey}`, `ListenPort = ${snapshot.listenPort ?? protocols.amneziawg.port}`, ...obfuscation(snapshot.server.headerProtectionKey),
    ...snapshot.peers.flatMap((peer) => ["", "[Peer]", `PublicKey = ${peer.publicKey}`, `PresharedKey = ${peer.presharedKey}`, `AllowedIPs = ${peer.address}`]), ""].join("\n");
}

export function amneziaClient(credential: ConnectionCredential, serial: number, host: string, server = amneziaIdentity(), port = protocols.amneziawg.port) {
  const peer = amneziaPeer(credential, serial);
  return ["[Interface]", `PrivateKey = ${peer.privateKey}`, `Address = ${peer.address}`, "DNS = 1.1.1.1, 9.9.9.9", "MTU = 1280",
    ...obfuscation(server.headerProtectionKey), "", "[Peer]", `PublicKey = ${publicKey(server.privateKey)}`,
    `PresharedKey = ${peer.presharedKey}`, `Endpoint = ${host}:${port}`, "AllowedIPs = 0.0.0.0/0, ::/0", "PersistentKeepalive = 25", ""].join("\n");
}
