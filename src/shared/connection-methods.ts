import {z} from "zod";
import { engineIds, engines, type EngineId } from "./engines";
import { protocols, type ProtocolId } from "./protocols";

export const methodInputSchema = z.object({
  engine: z.enum(engineIds as [EngineId, ...EngineId[]]),
  protocol: z.enum(Object.keys(protocols) as [ProtocolId, ...ProtocolId[]]),
  name: z.string().trim().min(1).max(80).regex(/^[^\p{Cc}]+$/u),
  enabled: z.boolean(),
  settings: z.object({ port: z.number().int().min(1).max(65535), path: z.string().max(180).optional(), fingerprint: z.enum(["chrome", "firefox", "safari", "none"]).optional() }).strict(),
}).strict();
export type MethodSettings = z.infer<typeof methodInputSchema>["settings"];
export type ConnectionMethod = z.infer<typeof methodInputSchema> & {id: string; updatedAt: number};

// Server capabilities, independently of which engine supplies the migrated default.
export const engineCapabilities: Record<EngineId, readonly ProtocolId[]> = {
  hysteria: ["hysteria2"], xray: ["xhttp", "grpc"],
  mihomo: ["hysteria2", "xhttp", "grpc", "anytls", "trusttunnel"],
  "sing-box": ["hysteria2", "grpc", "anytls", "naive"], amneziawg: ["amneziawg"],
};
export const methodNetworks = (method: Pick<ConnectionMethod, "protocol">) => protocols[method.protocol].networks;
export const singletonEngine = (engine: EngineId) => engine === "hysteria" || engine === "amneziawg";
export const managedEdge = (method: Pick<ConnectionMethod, "engine">) => method.engine === "xray";
export const methodFields = (protocol: ProtocolId) => ({ path: protocol === "xhttp" || protocol === "grpc", fingerprint: ["xhttp", "grpc", "anytls", "trusttunnel"].includes(protocol) });

export function methodSettings(engine: EngineId, protocol: ProtocolId, paths = { xhttp: "/tunnel", grpc: "tunnel" }): MethodSettings {
  return { port: engine === "xray" ? 443 : protocols[protocol].port + (protocols[protocol].defaultEngine !== engine ? engineIds.indexOf(engine) * 1000 : 0),
    ...(methodFields(protocol).path ? { path: paths[protocol as "xhttp" | "grpc"] } : {}),
    ...(methodFields(protocol).fingerprint ? { fingerprint: "chrome" as const } : {}),
  };
}

export function defaultMethods(order: readonly EngineId[] = engineIds, paths?: { xhttp: string; grpc: string }): ConnectionMethod[] {
  return order.flatMap((engine) => Object.keys(engines[engine].protocols).map((value) => {
    const protocol = value as ProtocolId;
    return { id: `${engine}-${protocol}`, engine, protocol, name: protocols[protocol].name, enabled: true,
      settings: methodSettings(engine, protocol, paths), updatedAt: 0 };
  }));
}

export const clientProfiles = {
  mihomo: { name: "Mihomo YAML", protocols: ["hysteria2", "xhttp", "grpc"], minimumCore: "" },
  "mihomo-modern": { name: "Mihomo · modern YAML", protocols: ["hysteria2", "xhttp", "grpc", "anytls", "trusttunnel", "amneziawg"], minimumCore: "Mihomo ≥1.19.32" },
  "sing-box": { name: "sing-box JSON", protocols: ["hysteria2", "grpc"], minimumCore: "" },
  "sing-box-modern": { name: "sing-box · modern JSON", protocols: ["hysteria2", "grpc", "anytls", "naive"], minimumCore: "sing-box ≥1.14.3", requirements: {naive: "Naive: Cronet"} },
  "xray-json": { name: "Xray JSON", protocols: ["xhttp", "grpc"], minimumCore: "" },
  xray: { name: "VLESS · Base64", protocols: ["xhttp", "grpc"], minimumCore: "" },
  links: { name: "URI links", protocols: ["hysteria2", "xhttp", "grpc"], minimumCore: "" },
  naive: { name: "NaiveProxy JSON", protocols: ["naive"], minimumCore: "NaiveProxy / sing-box ≥1.14.3", requirements: {naive: "Naive: Cronet"} },
  amneziawg: { name: "AmneziaWG .conf", protocols: ["amneziawg"], minimumCore: "AmneziaVPN ≥5.0.1.5 / AWG 3.1" },
} satisfies Record<string, { name: string; protocols: readonly ProtocolId[]; minimumCore: string; requirements?: Partial<Record<ProtocolId, string>> }>;
export type ClientProfile = keyof typeof clientProfiles;
export const clientProfileFormat = (profile: ClientProfile) => profile.replace(/-modern$/, "");

export function clientProfileRequirements(id: ClientProfile, selected?: readonly ProtocolId[]) {
  const profile = clientProfiles[id];
  const requirements = "requirements" in profile ? Object.entries(profile.requirements).filter(([protocol]) => !selected || selected.includes(protocol as ProtocolId)).map(([, requirement]) => requirement) : [];
  return [profile.minimumCore, ...requirements].filter(Boolean).join(" · ");
}

export function methodClientProfiles(method: Pick<ConnectionMethod, "protocol">) {
  return Object.entries(clientProfiles).filter(([, profile]) => (profile.protocols as readonly ProtocolId[]).includes(method.protocol))
    .map(([id, profile]) => ({...profile, id: id as ClientProfile, minimumCore: clientProfileRequirements(id as ClientProfile, [method.protocol])}));
}

export function compatibleMethods(methods: readonly ConnectionMethod[], profile: ClientProfile, installed: readonly EngineId[]) {
  const supported: readonly string[] = clientProfiles[profile].protocols;
  return methods.filter((method) => method.enabled && installed.includes(method.engine) && supported.includes(method.protocol));
}
