import definitions from "../../agent/internal/policy/engines.json";

export type EngineId = keyof typeof definitions;
export const engines = definitions;
export const engineIds = Object.keys(engines) as EngineId[];
// Legacy default listeners are migration input; server capabilities live in the
// method catalog and must not be mistaken for exclusive engine ownership.
export const engineMetadata = Object.fromEntries(engineIds.map((id) => {
  const { protocols: _defaults, ...definition } = engines[id];
  return [id, definition];
}));
export const engineServices = engineIds.map((id) => engines[id].service);
export const requiredEngineIds = engineIds.filter((id) => !engines[id].optional);
export const serviceNames = ["outpost", "nginx", ...engineServices];
export const isEngine = (value: unknown): value is EngineId => typeof value === "string" && Object.hasOwn(engines, value);
export const engineFile = (id: EngineId) => engines[id].file;

export function engineName(value: unknown, fallback = "") {
  return isEngine(value) ? engines[value].name : typeof value === "string" ? value : fallback;
}

const serviceLabels: Record<string, string> = { outpost: "Outpost", nginx: "Nginx", "vless-xhttp": "VLESS XHTTP", "vless-grpc": "VLESS gRPC",
  ...Object.fromEntries(engineIds.map((id) => [engines[id].service, engines[id].name])),
};
export function serviceName(value: unknown, fallback = "") {
  return typeof value === "string" ? serviceLabels[value] ?? value : fallback;
}
