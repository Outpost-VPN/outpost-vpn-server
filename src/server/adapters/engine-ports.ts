import YAML from "yaml";
import type { EngineId } from "../../shared/engines";

// Inspect the rendered runtime contract, so health and ingress follow actual
// listeners instead of the engine's default protocol inventory.
export function runtimePorts(engine: EngineId, text: string, health = false): string[] {
  const profile = engine === "hysteria" || engine === "mihomo" ? YAML.parse(text) : JSON.parse(text);
  const ports: string[] = [];
  const add = (port: unknown, network: string, listen = "0.0.0.0") => {
    const value = Number(port);
    if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error("Invalid managed listener port");
    if (value && (health || ["", "0.0.0.0", "::"].includes(listen))) ports.push(`${value}/${network}`);
  };
  const address = (value: string, network: string) => {
    const index = value.lastIndexOf(":");
    if (index < 0) throw new Error("Invalid managed listen address");
    add(value.slice(index + 1), network, value.slice(0, index));
  };
  if (engine === "amneziawg") add(profile.listenPort ?? 51820, "udp");
  else if (engine === "hysteria") {
    address(profile.listen, "udp");
    if (health) address(profile.trafficStats.listen, "tcp");
  } else {
    const listeners = engine === "mihomo" ? profile.listeners : profile.inbounds;
    if (!Array.isArray(listeners)) throw new Error("Managed listener array is missing");
    for (const listener of listeners) add(listener.port ?? listener.listen_port, listener.type === "hysteria2" ? "udp" : "tcp", listener.listen);
    if (health && engine === "mihomo") address(profile["external-controller"], "tcp");
    if (health && engine === "xray") address(profile.api.listen, "tcp");
    if (health && engine === "sing-box") for (const service of profile.services ?? []) add(service.listen_port, "tcp", service.listen);
    // Xray's only public endpoints terminate at the managed Nginx edge.
    if (!health && engine === "xray" && listeners.length) ports.push("443/tcp");
  }
  return [...new Set(ports)];
}
