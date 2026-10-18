import { engineIds, engines, type EngineId } from "./engines";

type Keys<T> = T extends unknown ? keyof T : never;
export type ProtocolId = Keys<(typeof engines)[EngineId]["protocols"]>;
export type ProtocolDefinition = { name: string; engine: EngineId; port: number; networks: string[] };
export const protocols = Object.fromEntries(engineIds.flatMap((engine) => Object.entries(engines[engine].protocols)
  .map(([id, definition]) => [id, { ...definition, engine }]))) as Record<ProtocolId, ProtocolDefinition>;
export const legacyProtocols: readonly ProtocolId[] = ["hysteria2", "xhttp", "grpc"];

export function enginePorts(id: EngineId) {
  return [...new Set(Object.values(engines[id].protocols).flatMap((protocol) => protocol.networks.map((network) => `${protocol.port}/${network}`)))];
}
export function engineHealth(id: EngineId) {
  const engine = engines[id];
  return "health" in engine ? engine.health : enginePorts(id);
}
export function engineTransport(id: EngineId) {
  const groups = new Map<string, string[]>();
  for (const protocol of Object.values(engines[id].protocols)) {
    const endpoint = `${protocol.networks.join("/").toUpperCase()} ${protocol.port}`;
    groups.set(endpoint, [...groups.get(endpoint) ?? [], protocol.name]);
  }
  return [...groups].map(([endpoint, names]) => `${names.join(" / ")} · ${endpoint}`).join(" / ");
}
