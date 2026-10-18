import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConnectionCredential } from "../models";
import type { OutpostDatabase } from "../db/database";
import { config } from "../config";
import { ConnectionService } from "./connections";
import { engineFile, type EngineId } from "../../shared/engines";
import type { ConnectionMethod } from "../../shared/connection-methods";
import { defaultEngineTemplates } from "../adapters/engine-presets";
import { renderEngine } from "../adapters/engines";
import { callAgent } from "./operations";

export function renderXrayUserAdd(credential: ConnectionCredential) {
  return {
    inbounds: [
      {
        tag: "vless-xhttp",
        listen: "127.0.0.1",
        port: 10000,
        protocol: "vless",
        settings: { clients: [{ id: credential.xray.id, email: credential.xray.email, flow: "" }], decryption: "none" },
        streamSettings: { network: "xhttp", xhttpSettings: { path: config.xhttpPath, mode: "auto" } },
      },
      {
        tag: "vless-grpc",
        listen: "127.0.0.1",
        port: 10001,
        protocol: "vless",
        settings: { clients: [{ id: credential.xray.id, email: credential.xray.email, flow: "" }], decryption: "none" },
        streamSettings: { network: "grpc", grpcSettings: { serviceName: config.grpcService } },
      },
    ],
  };
}

export class EngineRuntimeService {
  private runtimeDir = join(config.dataDir, "runtime");

  constructor(private db: OutpostDatabase, private runner: typeof callAgent = callAgent) {
    mkdirSync(this.runtimeDir, { recursive: true, mode: 0o750 });
  }

  async add(connectionId: string, generation: number) {
    if (config.demo) return { ok: true, demo: true };
    const credential = this.credential(connectionId, generation);
    if (!this.defaultXrayListeners()) {
      await this.syncEngine("xray", this.activeCredentials({ include: { id: connectionId, generation } }));
      return this.syncOptional({ include: { id: connectionId, generation } });
    }
    const source = join(this.runtimeDir, `xray-add-${connectionId}-${generation}.json`);
    writeFileSync(source, JSON.stringify(renderXrayUserAdd(credential), null, 2), { mode: 0o640 });
    const rendered = this.renderRecovery({ include: { id: connectionId, generation } });
    await this.runner({ action: "xray.user.add", payload: { source, rendered } });
    return this.syncOptional({ include: { id: connectionId, generation } });
  }

  async rotate(connectionId: string, _previousGeneration: number, generation: number) {
    if (config.demo) return { ok: true, demo: true };
    await this.syncEngine("xray", this.activeCredentials({ include: { id: connectionId, generation } }));
    return this.syncOptional({ include: { id: connectionId, generation } });
  }

  async revoke(connectionId: string, generation: number) {
    if (config.demo) return { ok: true, demo: true };
    if (!this.defaultXrayListeners()) {
      await this.syncEngine("xray", this.activeCredentials({ exclude: connectionId }));
      return this.syncOptional({ exclude: connectionId });
    }
    const email = this.credential(connectionId, generation).xray.email;
    const rendered = this.renderRecovery({ exclude: connectionId });
    await this.runner({ action: "xray.user.revoke", payload: { email, rendered } });
    return this.syncOptional({ exclude: connectionId });
  }

  renderRecovery(options: { include?: { id: string; generation: number }; exclude?: string } = {}) {
    return this.renderSnapshot("xray", this.activeCredentials(options));
  }

  async prepareRecovery() {
    if (config.demo) return { ok: true, demo: true };
    const credentials = this.activeCredentials({});
    for (const engine of this.db.engines.installed()) {
      const source = this.renderSnapshot(engine, credentials);
      await this.runner({ action: "config.apply", payload: { source, target: join(config.configDir, "engines", engineFile(engine)), engine, restart: false } });
    }
  }

  private activeCredentials(options: { include?: { id: string; generation: number }; exclude?: string }) {
    const rows = this.db.raw.query<{ id: string; generation: number }, []>(`
      SELECT id, generation FROM connections
      WHERE status = 'active' AND suspended_at IS NULL AND archived_at IS NULL
    `).all();
    const selected = rows
      .filter((connection) => connection.id !== options.exclude && connection.id !== options.include?.id)
      .map((connection) => this.credential(connection.id, connection.generation));
    if (options.include && options.include.id !== options.exclude) {
      selected.push(this.credential(options.include.id, options.include.generation));
    }
    return selected;
  }

  private async syncOptional(options: { include?: { id: string; generation: number }; exclude?: string }) {
    const credentials = this.activeCredentials(options);
    for (const engine of this.db.engines.optionalInstalled()) {
      await this.syncEngine(engine, credentials);
    }
    return { ok: true };
  }

  async reconcile(engine: EngineId) {
    if (config.demo) return { ok: true, demo: true };
    return this.syncEngine(engine, this.activeCredentials({}));
  }

  async reconfigure(engine: EngineId, methods: ConnectionMethod[]) {
    if (config.demo) return { ok: true, demo: true };
    const source = this.renderSnapshot(engine, this.activeCredentials({}), methods);
    return this.runner({ action: "config.sync", payload: { source, engine } });
  }

  private defaultXrayListeners() {
    return this.db.methods.list().filter((method) => method.engine === "xray" && method.enabled).length === 2;
  }

  private async syncEngine(engine: EngineId, credentials: ConnectionCredential[]) {
    const source = this.renderSnapshot(engine, credentials);
    return this.runner({ action: "config.sync", payload: { source, engine } });
  }

  private renderSnapshot(engine: EngineId, credentials: ConnectionCredential[], methods = this.db.methods.list()) {
    const stored = this.db.raw.query<{ template: string }, string>("SELECT template FROM engine_configs WHERE engine = ? AND active = 1").get(engine);
    const source = join(this.runtimeDir, engineFile(engine));
    const temporary = `${source}.${crypto.randomUUID()}.tmp`;
    writeFileSync(temporary, renderEngine(engine, stored?.template ?? defaultEngineTemplates[engine], credentials, methods), { mode: 0o640 });
    renameSync(temporary, source);
    return source;
  }

  private credential(connectionId: string, generation: number): ConnectionCredential {
    return new ConnectionService(this.db).credentials(connectionId, generation);
  }
}
