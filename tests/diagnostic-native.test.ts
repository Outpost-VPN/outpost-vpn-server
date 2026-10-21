import {expect, test} from "bun:test";
import {existsSync, mkdtempSync, writeFileSync, rmSync, chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {nativeConfig} from "../src/diagnostics/client";
import {defaultMethods} from "../src/shared/connection-methods";
import {engineIds} from "../src/shared/engines";
import {mihomoOutbound, singBoxOutbound} from "../src/server/adapters/method-outbounds";
import type {SubscriptionContext} from "../src/server/adapters/subscriptions";
import {ConnectionService} from "../src/server/services/connections";
import {database} from "./helpers";

const mihomo = process.env.OUTPOST_MIHOMO_BINARY ?? resolve(import.meta.dir, "../.cache/native-tools/mihomo");
const singBox = process.env.OUTPOST_SINGBOX_BINARY ?? resolve(import.meta.dir, "../.cache/native-tools/sing-box");

test.skipIf(!existsSync(mihomo) || !existsSync(singBox))("native cores validate every diagnostic protocol profile without opening a tunnel", () => {
  const fixture = database(), directory = mkdtempSync(join(tmpdir(), "outpost-diagnostic-validation-")); chmodSync(directory, 0o700);
  try {
    const connections = new ConnectionService(fixture.db), connection = connections.create({name: "Validation"});
    const context: SubscriptionContext = {connection, credentials: connections.credentials(connection.id), routes: [], subscriptionToken: ""};
    const methods = defaultMethods(engineIds);
    for (const method of methods) {
      const family = method.protocol === "naive" ? "sing-box" : "mihomo";
      const config = family === "mihomo" ? mihomoOutbound(method, context) : singBoxOutbound(method, context);
      config.server = "1.1.1.1";
      const file = join(directory, `${method.id}.json`);
      writeFileSync(file, JSON.stringify(nativeConfig({methodId: method.id, protocol: method.protocol, family, config}, 12345, "en0")), {mode: 0o600});
      const result = Bun.spawnSync(family === "mihomo" ? [mihomo, "-t", "-d", directory, "-f", file] : [singBox, "check", "-c", file], {stdout: "ignore", stderr: "ignore"});
      expect(result.exitCode, `${method.id} diagnostic config`).toBe(0);
    }
  } finally {fixture.close(); rmSync(directory, {recursive: true, force: true});}
});
