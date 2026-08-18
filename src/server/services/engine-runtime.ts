import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeviceCredential } from "../models";
import type { MatreshkaDatabase } from "../db/database";
import { config } from "../config";
import { decryptSecret, type SecretBox } from "../security";
import { renderXray, defaultXrayTemplate } from "../adapters/engines";
import { callAgent } from "./operations";

type CredentialRow = SecretBox & { device_id: string; engine: string };

export class EngineRuntimeService {
  private runtimeDir = join(config.dataDir, "runtime");

  constructor(private db: MatreshkaDatabase) {
    mkdirSync(this.runtimeDir, { recursive: true, mode: 0o750 });
  }

  async add(deviceId: string) {
    if (config.demo) return { ok: true, demo: true };
    const credential = this.credential(deviceId);
    const source = join(this.runtimeDir, `xray-add-${deviceId}.json`);
    writeFileSync(source, JSON.stringify({
      inbounds: [{
        tag: "vless-xhttp",
        protocol: "vless",
        settings: { clients: [{ id: credential.xray.id, email: credential.xray.email, flow: "" }], decryption: "none" },
      }],
    }, null, 2), { mode: 0o640 });
    const rendered = this.renderRecovery({ includeDeviceId: deviceId });
    return callAgent({ action: "xray.user.add", payload: { source, rendered } });
  }

  async revoke(deviceId: string) {
    if (config.demo) return { ok: true, demo: true };
    const email = this.credential(deviceId).xray.email;
    const rendered = this.renderRecovery({ excludeDeviceId: deviceId });
    return callAgent({ action: "xray.user.revoke", payload: { email, rendered } });
  }

  renderRecovery(options: { includeDeviceId?: string; excludeDeviceId?: string } = {}) {
    const output = join(this.runtimeDir, "xray.json");
    const stored = this.db.raw.query<{ template: string }, []>(
      "SELECT template FROM engine_configs WHERE engine = 'xray' AND active = 1",
    ).get();
    writeFileSync(output, renderXray(stored?.template ?? defaultXrayTemplate, this.activeCredentials(options)), { mode: 0o640 });
    return output;
  }

  private activeCredentials(options: { includeDeviceId?: string; excludeDeviceId?: string }) {
    const devices = this.db.raw.query<{ id: string }, [string | null]>(
      "SELECT id FROM devices WHERE status = 'active' OR id = ?",
    ).all(options.includeDeviceId ?? null);
    return devices
      .filter((device) => device.id !== options.excludeDeviceId)
      .map((device) => this.credential(device.id));
  }

  private credential(deviceId: string): DeviceCredential {
    const rows = this.db.raw.query<CredentialRow, string>(`
      SELECT credentials.device_id, credentials.engine, credentials.ciphertext, credentials.iv, credentials.tag
      FROM credentials WHERE device_id = ? AND revoked_at IS NULL
    `).all(deviceId);
    const hysteria = rows.find((row) => row.engine === "hysteria");
    const xray = rows.find((row) => row.engine === "xray");
    if (!hysteria || !xray) throw new Error("Device credentials are unavailable");
    return { deviceId, hysteria: decryptSecret(hysteria), xray: decryptSecret(xray) };
  }
}
