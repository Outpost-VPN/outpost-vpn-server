import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConnectionCredential } from "../models";
import type { OutpostDatabase } from "../db/database";
import { config } from "../config";
import { decryptSecret, type SecretBox } from "../security";
import { renderXray, defaultXrayTemplate } from "../adapters/engines";
import { callAgent } from "./operations";

type CredentialRow = SecretBox & { connection_id: string; engine: string };

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

  constructor(private db: OutpostDatabase) {
    mkdirSync(this.runtimeDir, { recursive: true, mode: 0o750 });
  }

  async add(connectionId: string, generation: number) {
    if (config.demo) return { ok: true, demo: true };
    const credential = this.credential(connectionId, generation);
    const source = join(this.runtimeDir, `xray-add-${connectionId}-${generation}.json`);
    writeFileSync(source, JSON.stringify(renderXrayUserAdd(credential), null, 2), { mode: 0o640 });
    const rendered = this.renderRecovery({ include: { id: connectionId, generation } });
    return callAgent({ action: "xray.user.add", payload: { source, rendered } });
  }

  async rotate(connectionId: string, _previousGeneration: number, generation: number) {
    if (config.demo) return { ok: true, demo: true };
    const source = this.renderRecovery({ include: { id: connectionId, generation } });
    return callAgent({
      action: "config.apply",
      payload: { source, target: join(config.configDir, "engines", "xray.json"), engine: "xray" },
    });
  }

  async revoke(connectionId: string, generation: number) {
    if (config.demo) return { ok: true, demo: true };
    const email = this.credential(connectionId, generation).xray.email;
    const rendered = this.renderRecovery({ exclude: connectionId });
    return callAgent({ action: "xray.user.revoke", payload: { email, rendered } });
  }

  renderRecovery(options: { include?: { id: string; generation: number }; exclude?: string } = {}) {
    const output = join(this.runtimeDir, "xray.json");
    const stored = this.db.raw.query<{ template: string }, []>(
      "SELECT template FROM engine_configs WHERE engine = 'xray' AND active = 1",
    ).get();
    writeFileSync(output, renderXray(stored?.template ?? defaultXrayTemplate, this.activeCredentials(options)), { mode: 0o640 });
    return output;
  }

  private activeCredentials(options: { include?: { id: string; generation: number }; exclude?: string }) {
    const rows = this.db.raw.query<{ id: string; generation: number }, []>(`
      SELECT id, generation FROM connections WHERE status = 'active' AND archived_at IS NULL
    `).all();
    const selected = rows
      .filter((connection) => connection.id !== options.exclude && connection.id !== options.include?.id)
      .map((connection) => this.credential(connection.id, connection.generation));
    if (options.include && options.include.id !== options.exclude) {
      selected.push(this.credential(options.include.id, options.include.generation));
    }
    return selected;
  }

  private credential(connectionId: string, generation: number): ConnectionCredential {
    const rows = this.db.raw.query<CredentialRow, [string, number]>(`
      SELECT connection_id, engine, ciphertext, iv, tag FROM credentials
      WHERE connection_id = ? AND generation = ? AND state != 'revoked'
    `).all(connectionId, generation);
    const hysteria = rows.find((row) => row.engine === "hysteria");
    const xray = rows.find((row) => row.engine === "xray");
    if (!hysteria || !xray) throw new Error("Connection credentials are unavailable");
    return { connectionId, generation, hysteria: decryptSecret(hysteria), xray: decryptSecret(xray) };
  }
}
