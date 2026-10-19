import { engineIds, isEngine, type EngineId } from "../../shared/engines";
import { defaultMethods, methodInputSchema, engineCapabilities, managedEdge, methodNetworks, methodSettings, singletonEngine, type ConnectionMethod } from "../../shared/connection-methods";
import { protocols } from "../../shared/protocols";
import type { OutpostDatabase } from "../db/database";
import { config } from "../config";
import { ServiceError } from "./connections";
import { JournalService } from "./journal";
import {engineApi} from "../adapters/engine-api";

const paths = () => ({ xhttp: config.xhttpPath, grpc: config.grpcService });
const reservedPorts = [8181, 8443, 10000, 10001, ...Object.values(engineApi).map((address) => Number(address.split(":")[1]))];

export class ConnectionMethodStore {
  constructor(protected db: OutpostDatabase) {}

  list(): ConnectionMethod[] {
    return this.db.setting<ConnectionMethod[]>("connection_methods", []).map((method) => managedEdge(method)
      ? { ...method, settings: { ...method.settings, port: 443, path: paths()[method.protocol as "xhttp" | "grpc"] } }
      : method);
  }

  migrate() {
    if (this.db.setting<unknown>("connection_methods", null) !== null) return;
    const order = this.db.setting<EngineId[]>("engine_order", engineIds);
    const valid = [...new Set([...order.filter(isEngine), ...engineIds])].filter((id) => this.db.engines.has(id));
    this.db.setSetting("connection_methods", defaultMethods(valid, paths()));
  }

  state() {
    const items = this.list();
    return { items, capabilities: engineCapabilities, defaults: Object.fromEntries(engineIds.map((engine) => [engine,
      Object.fromEntries(engineCapabilities[engine].map((protocol) => {
        const settings = methodSettings(engine, protocol, paths());
        if (!managedEdge({ engine }) && !singletonEngine(engine)) {
          while (reservedPorts.includes(settings.port) || items.some((method) => method.settings.port === settings.port && methodNetworks(method).some((network) => protocols[protocol].networks.includes(network)))) settings.port++;
        }
        return [protocol, settings];
      })),
    ])) };
  }

}

export class ConnectionMethodService extends ConnectionMethodStore {
  constructor(db: OutpostDatabase, private apply: (engine: EngineId, methods: ConnectionMethod[]) => Promise<unknown>) { super(db); }

  async save(value: unknown, actor: string, id?: string) {
    const parsed = methodInputSchema.safeParse(value);
    if (!parsed.success) throw new ServiceError(400, "Invalid connection method", parsed.error.issues.map((issue) => issue.message));
    const before = this.list();
    const previous = id ? before.find((method) => method.id === id) : undefined;
    if (id && !previous) throw new ServiceError(404, "Connection method not found");
    const method: ConnectionMethod = { ...parsed.data, id: previous?.id ?? crypto.randomUUID(), updatedAt: Date.now() };
    if (previous && (previous.engine !== method.engine || previous.protocol !== method.protocol)) throw new ServiceError(400, "Create a new method to change its engine or protocol");
    const next = previous ? before.map((item) => item.id === id ? method : item) : [...before, method];
    this.validate(next, method);
    await this.commit(before, next, actor, method.engine);
    return method;
  }

  async remove(id: string, actor: string) {
    const before = this.list();
    const method = before.find((item) => item.id === id);
    if (!method) throw new ServiceError(404, "Connection method not found");
    await this.commit(before, before.filter((item) => item.id !== id), actor, method.engine);
  }

  async reorder(value: unknown, actor: string) {
    const before = this.list();
    if (!Array.isArray(value) || value.length !== before.length || new Set(value).size !== before.length || value.some((id) => !before.some((method) => method.id === id))) throw new ServiceError(400, "Specify every connection method exactly once");
    const next = value.map((id) => before.find((method) => method.id === id)!);
    await this.commit(before, next, actor);
    return next;
  }

  private validate(methods: ConnectionMethod[], method: ConnectionMethod) {
    if (!this.db.engines.has(method.engine)) throw new ServiceError(409, "Install the selected engine first");
    if (!engineCapabilities[method.engine].includes(method.protocol)) throw new ServiceError(400, "Unsupported server protocol for this engine");
    const peers = methods.filter((item) => item.id !== method.id);
    if (["PROXY", "DIRECT", "REJECT", "GLOBAL"].includes(method.name.toUpperCase())) throw new ServiceError(400, "This name is reserved by client routing policies");
    if (peers.some((item) => item.name.toLocaleLowerCase() === method.name.toLocaleLowerCase())) throw new ServiceError(409, "Choose a unique connection method name");
    if ((singletonEngine(method.engine) && peers.some((item) => item.engine === method.engine)) || (managedEdge(method) && peers.some((item) => item.engine === method.engine && item.protocol === method.protocol))) throw new ServiceError(409, "This managed listener already exists");
    const expected = methodSettings(method.engine, method.protocol, paths());
    if (managedEdge(method) && (method.settings.port !== expected.port || method.settings.path !== expected.path)) throw new ServiceError(400, "This listener uses the managed HTTPS edge address and path");
    if (!managedEdge(method) && method.settings.port < 1024 && !(method.engine === "hysteria" && method.settings.port === 443)) throw new ServiceError(400, "Use an unprivileged public port (1024–65535)");
    if (reservedPorts.includes(method.settings.port)) throw new ServiceError(409, "Port is reserved for an existing service");
    if (method.protocol === "xhttp" && !/^\/[A-Za-z0-9_./-]+$/.test(method.settings.path ?? "")) throw new ServiceError(400, "Invalid XHTTP path");
    if (method.protocol === "grpc" && !/^[A-Za-z0-9_.-]+$/.test(method.settings.path ?? "")) throw new ServiceError(400, "Invalid gRPC service name");
    if (method.settings.path && !["xhttp", "grpc"].includes(method.protocol)) throw new ServiceError(400, "This protocol has no transport path");
    if (method.enabled && peers.some((item) => item.enabled && item.settings.port === method.settings.port && methodNetworks(item).some((network) => methodNetworks(method).includes(network)) && !(managedEdge(item) && managedEdge(method)))) throw new ServiceError(409, "Another connection method already uses this port and network");
  }

  private async commit(before: ConnectionMethod[], next: ConnectionMethod[], actor: string, engine?: EngineId) {
    if (engine) await this.apply(engine, next);
    try {
      this.db.raw.transaction(() => {
        this.db.setSetting("connection_methods", next);
        const auditId = this.db.audit({ actor, action: engine ? "methods.configure" : "methods.reorder", resource: "connection_methods", before, after: next });
        new JournalService(this.db).record(engine ? "method.configured" : "method.reordered", {
          actor, auditId, source: engine ?? "engines", subjectType: "connection_methods", data: { engine, count: next.length },
        });
      })();
    } catch (error) {
      if (engine) await this.apply(engine, before);
      throw error;
    }
  }
}
