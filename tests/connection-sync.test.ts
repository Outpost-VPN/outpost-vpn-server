import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConnectionSyncService } from "../src/server/services/connection-sync";
import { ConnectionService } from "../src/server/services/connections";
import { database } from "./helpers";

class StubEngine {
  failAdd = false;
  failRotate = false;
  failRevoke = false;
  addCalls = 0;
  rotateCalls = 0;
  revokeCalls = 0;

  async add() {
    this.addCalls++;
    if (this.failAdd) throw new Error("one Xray inbound failed");
    return { ok: true };
  }

  async rotate() {
    this.rotateCalls++;
    if (this.failRotate) throw new Error("xray rotation unavailable");
    return { ok: true };
  }

  async revoke() {
    this.revokeCalls++;
    if (this.failRevoke) throw new Error("xray revoke unavailable");
    return { ok: true };
  }
}

describe("persistent connection provisioning", () => {
  let fixture: ReturnType<typeof database>;
  let connections: ConnectionService;
  let engine: StubEngine;
  let sync: ConnectionSyncService;

  beforeEach(() => {
    fixture = database();
    connections = new ConnectionService(fixture.db);
    engine = new StubEngine();
    sync = new ConnectionSyncService(fixture.db, connections, engine);
  });

  afterEach(() => fixture.close());

  test("activates immediately when the engine succeeds", async () => {
    const created = connections.create({ name: "Мама" });
    const result = await sync.activate(created.id);
    expect(result.state).toBe("ready");
    expect(result.subscription?.url).toContain("/s/");
    expect(connections.get(created.id).status).toBe("active");
    expect(sync.list()[0]).toMatchObject({ kind: "activate", status: "completed", attempts: 1 });
  });

  test("keeps provisioning persistent after an engine failure and retries", async () => {
    const created = connections.create({ name: "Тестовое подключение" });
    engine.failAdd = true;
    const pending = await sync.activate(created.id);
    expect(pending).toMatchObject({ state: "retrying", error: "one Xray inbound failed" });
    expect(connections.get(created.id).status).toBe("provisioning");
    engine.failAdd = false;
    const completed = await sync.retry(created.id);
    expect(completed.state).toBe("ready");
    expect(sync.list()[0]).toMatchObject({ status: "completed", attempts: 2 });
  });

  test("returns interrupted jobs to the retryable queue", () => {
    const created = connections.create({ name: "Алексей" });
    const job = sync.list()[0]!;
    fixture.db.raw.query("UPDATE connection_sync_jobs SET status = 'running' WHERE id = ?").run(job.id);
    const restarted = new ConnectionSyncService(fixture.db, connections, engine);
    restarted.recoverInterrupted();
    expect(restarted.connection(created.id).state).toBe("retrying");
    expect(restarted.list()[0]).toMatchObject({ status: "failed", last_error: "Процесс остановился во время синхронизации" });
  });

  test("rotation invalidates the old link immediately and can be retried", async () => {
    const created = connections.create({ name: "Семья" });
    const ready = await sync.activate(created.id);
    const oldUrl = ready.subscription!.url;
    const oldToken = oldUrl.split("/").at(-1)!;
    engine.failRotate = true;
    const pending = await sync.rotate(created.id);
    expect(pending.state).toBe("rotation_retry");
    expect(() => connections.bySubscriptionToken(oldToken)).toThrow("Ссылка не найдена");
    expect(connections.authenticateHysteria(connections.credentials(created.id, 1).hysteria.password).ok).toBeFalse();
    engine.failRotate = false;
    const rotated = await sync.retry(created.id);
    expect(rotated.state).toBe("ready");
    expect(rotated.subscription!.url).not.toBe(oldUrl);
    expect(connections.get(created.id).generation).toBe(2);
  });

  test("archive closes the link before engine cleanup succeeds", async () => {
    const created = connections.create({ name: "Гости" });
    const ready = await sync.activate(created.id);
    const token = ready.subscription!.url.split("/").at(-1)!;
    engine.failRevoke = true;
    const pending = await sync.archive(created.id);
    expect(pending.state).toBe("archive_retry");
    expect(() => connections.bySubscriptionToken(token)).toThrow("Ссылка не найдена");
    engine.failRevoke = false;
    const archived = await sync.retry(created.id);
    expect(archived.state).toBe("archived");
    expect(connections.list()).toHaveLength(0);
  });

  test("archives a connection that never reached an engine", async () => {
    const created = connections.create({ name: "Неактивированное подключение" });
    const archived = await sync.archive(created.id);
    expect(archived.state).toBe("archived");
    expect(engine.revokeCalls).toBe(0);
  });
});
