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
  mihomo: { protocols: ["hysteria2", "xhttp", "grpc"], minimumCore: "" },
  "mihomo-modern": { protocols: ["hysteria2", "xhttp", "grpc", "anytls", "trusttunnel", "amneziawg"], minimumCore: "Mihomo ≥1.19.32" },
  "sing-box": { protocols: ["hysteria2", "grpc"], minimumCore: "" },
  "sing-box-modern": { protocols: ["hysteria2", "grpc", "anytls", "naive"], minimumCore: "sing-box ≥1.14.3 · Naive/Cronet" },
  "xray-json": { protocols: ["xhttp", "grpc"], minimumCore: "" },
  xray: { protocols: ["xhttp", "grpc"], minimumCore: "" },
  links: { protocols: ["hysteria2", "xhttp", "grpc"], minimumCore: "" },
  naive: { protocols: ["naive"], minimumCore: "NaiveProxy / sing-box ≥1.14.3" },
  amneziawg: { protocols: ["amneziawg"], minimumCore: "AmneziaVPN ≥5.0.1.5 / AWG 3.1" },
} satisfies Record<string, { protocols: readonly ProtocolId[]; minimumCore: string }>;
export type ClientProfile = keyof typeof clientProfiles;
export const clientProfileFormat = (profile: ClientProfile) => profile.replace(/-modern$/, "");

export function compatibleMethods(methods: readonly ConnectionMethod[], profile: ClientProfile, installed: readonly EngineId[]) {
  const supported: readonly string[] = clientProfiles[profile].protocols;
  return methods.filter((method) => method.enabled && installed.includes(method.engine) && supported.includes(method.protocol));
}
