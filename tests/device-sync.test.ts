import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DeviceSyncService } from "../src/server/services/device-sync";
import { PeopleService } from "../src/server/services/people";
import { database } from "./helpers";

class StubEngine {
  failAdd = false;
  failRevoke = false;
  addCalls = 0;
  revokeCalls = 0;

  async add() {
    this.addCalls++;
    if (this.failAdd) throw new Error("xray add unavailable");
    return { ok: true };
  }

  async revoke() {
    this.revokeCalls++;
    if (this.failRevoke) throw new Error("xray revoke unavailable");
    return { ok: true };
  }
}

describe("persistent device sync", () => {
  let fixture: ReturnType<typeof database>;
  let people: PeopleService;
  let engine: StubEngine;
  let sync: DeviceSyncService;

  beforeEach(() => {
    fixture = database();
    people = new PeopleService(fixture.db);
    engine = new StubEngine();
    sync = new DeviceSyncService(fixture.db, people, engine);
  });

  afterEach(() => fixture.close());

  test("does not activate the database before the engine succeeds and can retry the same invitation", async () => {
    const person = people.create({ name: "Мама" });
    const created = people.createDevice(person.id, { name: "iPhone", platform: "ios", client: "incy" });
    const token = created.invitation.url.split("/").at(-1)!;
    engine.failAdd = true;

    const pending = await sync.redeem(token);
    expect(pending.pending).toBeTrue();
    expect(people.device(created.device.id).status).toBe("invited");
    expect(sync.list()[0]).toMatchObject({ kind: "activate", status: "failed", attempts: 1 });

    engine.failAdd = false;
    const completed = await sync.redeem(token);
    expect(completed.pending).toBeFalse();
    expect(people.device(created.device.id).status).toBe("active");
    expect(sync.list()[0]).toMatchObject({ kind: "activate", status: "completed", attempts: 2 });
  });

  test("keeps an active subscription valid until engine revocation succeeds", async () => {
    const person = people.create({ name: "Папа" });
    const created = people.createDevice(person.id, { name: "Mac", platform: "macos", client: "mihomo" });
    const activation = await sync.redeem(created.invitation.url.split("/").at(-1)!);
    if (activation.pending) throw new Error("Device activation did not complete");
    const subscriptionToken = activation.subscriptionUrl.split("/").at(-1)!;
    engine.failRevoke = true;

    expect(sync.revoke(created.device.id)).rejects.toThrow("очереди");
    await Bun.sleep(1);
    expect(people.device(created.device.id).status).toBe("active");
    expect(people.bySubscriptionToken(subscriptionToken).id).toBe(created.device.id);

    engine.failRevoke = false;
    await sync.revoke(created.device.id);
    expect(people.device(created.device.id).status).toBe("revoked");
    expect(() => people.bySubscriptionToken(subscriptionToken)).toThrow("Подписка не найдена");
  });

  test("returns interrupted jobs to the retryable queue after restart", async () => {
    const person = people.create({ name: "Алексей" });
    const created = people.createDevice(person.id, { name: "Телефон", platform: "android", client: "mihomo" });
    engine.failAdd = true;
    await sync.redeem(created.invitation.url.split("/").at(-1)!);
    const job = sync.list()[0]!;
    fixture.db.raw.query("UPDATE device_sync_jobs SET status = 'running' WHERE id = ?").run(job.id);

    sync.recoverInterrupted();

    expect(sync.list()[0]).toMatchObject({ status: "failed", last_error: "Процесс остановился во время синхронизации" });
  });
});
