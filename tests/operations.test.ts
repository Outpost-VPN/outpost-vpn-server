import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { OperationService } from "../src/server/services/operations";
import { PeopleService } from "../src/server/services/people";
import { database } from "./helpers";
import { JournalService } from "../src/server/services/journal";

describe("confirmed operations", () => {
  let fixture: ReturnType<typeof database>;
  beforeEach(() => { fixture = database(); });
  afterEach(() => fixture.close());

  test("binds confirmation ID to exact action and payload", () => {
    const people = new PeopleService(fixture.db);
    const person = people.create({ name: "Тест" });
    const created = people.createDevice(person.id, { name: "Mac", platform: "macos", client: "mihomo" });
    const operations = new OperationService(fixture.db);
    const payload = { deviceId: created.device.id };
    const preview = operations.preview("device.revoke", payload);
    expect(() => operations.confirm(preview.confirmationId, "device.revoke", { deviceId: crypto.randomUUID() })).toThrow("не соответствует");
  });

  test("rejects services outside the fixed allowlist", () => {
    const operations = new OperationService(fixture.db);
    expect(() => operations.preview("service.restart", { service: "ssh" })).toThrow("нельзя перезапустить");
    expect(operations.preview("service.stop", { service: "xray" }).preview).toMatchObject({ title: "Остановить Xray" });
    expect(() => operations.preview("service.stop", { service: "matreshka" })).toThrow("нельзя запускать или останавливать");
  });

  test("writes semantic engine stop events", async () => {
    const operations = new OperationService(fixture.db, undefined, undefined, undefined, async () => ({ ok: true }));
    const payload = { service: "hysteria-server" };
    const preview = operations.preview("service.stop", payload);
    operations.confirm(preview.confirmationId, "service.stop", payload);
    await Bun.sleep(5);

    const events = new JournalService(fixture.db).list({ q: "Hysteria" }).events;
    expect(events.map((event) => event.type)).toContain("service.stop_started");
    expect(events.map((event) => event.type)).toContain("service.stopped");
  });

  test("only installs the pinned engine update with its checksum", () => {
    const operations = new OperationService(fixture.db);
    const checksum = "a".repeat(64);
    fixture.db.raw.query("UPDATE engine_versions SET desired_version = ?, checksum = ? WHERE engine = 'xray'")
      .run("26.4.1", checksum);

    expect(operations.preview("engine.update", { engine: "xray", version: "26.4.1", checksum }).preview)
      .toMatchObject({ title: "Обновить Xray до 26.4.1" });
    expect(() => operations.preview("engine.update", { engine: "xray", version: "26.4.2", checksum }))
      .toThrow("закреплённым обновлением");
    expect(() => operations.preview("engine.update", { engine: "xray", version: "26.4.1", checksum: "b".repeat(64) }))
      .toThrow("закреплённым обновлением");
  });

  test("requires a matching detached signature for application updates", () => {
    const operations = new OperationService(fixture.db);
    const bundle = "/var/lib/matreshka/incoming/matreshka-0.1.1-linux-amd64.tar.gz";
    const payload = { version: "0.1.1", bundle, signature: `${bundle}.minisig` };
    expect(operations.preview("update.apply", payload).preview).toMatchObject({ title: "Обновить Matreshka" });
    expect(() => operations.preview("update.apply", { version: "0.1.1", bundle }))
      .toThrow("Подпись должна соответствовать");
    expect(() => operations.preview("update.apply", { ...payload, signature: "/tmp/release.minisig" }))
      .toThrow("Подпись должна соответствовать");
  });

  test("writes semantic start and success events instead of a generic operation", async () => {
    const operations = new OperationService(
      fixture.db,
      undefined,
      undefined,
      undefined,
      async () => ({ ok: true, size: 716_800 }),
    );
    const payload = { passphrase: "correct horse battery staple", output: "/var/lib/matreshka/backups/matreshka-aabbccdd-1122-3344-5566-77889900aabb.age" };
    const preview = operations.preview("backup.export", payload);
    operations.confirm(preview.confirmationId, "backup.export", payload);
    await Bun.sleep(5);

    const events = new JournalService(fixture.db).list({ category: "maintenance" }).events;
    expect(events.map((event) => event.type)).toContain("backup.started");
    expect(events.map((event) => event.type)).toContain("backup.created");
    expect(JSON.stringify(events)).not.toContain(payload.passphrase);
    expect(events.some((event) => event.type.startsWith("legacy."))).toBeFalse();
  });

  test("creates an unencrypted backup when password protection is disabled", async () => {
    const operations = new OperationService(
      fixture.db,
      undefined,
      undefined,
      undefined,
      async () => ({ ok: true, size: 512_000 }),
    );
    const payload = { output: "/var/lib/matreshka/backups/matreshka-bbccddee-2233-4455-6677-889900aabbcc.tar" };
    const preview = operations.preview("backup.export", payload);
    expect(JSON.stringify(preview.preview)).toContain("Архив будет создан без шифрования");
    operations.confirm(preview.confirmationId, "backup.export", payload);
    await Bun.sleep(5);

    const events = new JournalService(fixture.db).list({ category: "maintenance" }).events;
    const completed = events.find((event) => event.type === "backup.created");
    expect(completed?.details.data).toMatchObject({ encrypted: false });
  });

  test("writes the semantic failure event once", async () => {
    const operations = new OperationService(
      fixture.db,
      undefined,
      undefined,
      undefined,
      async () => { throw new Error("restart failed"); },
    );
    const payload = { service: "xray" };
    const preview = operations.preview("service.restart", payload);
    operations.confirm(preview.confirmationId, "service.restart", payload);
    await Bun.sleep(5);

    const events = new JournalService(fixture.db).list({ q: "Xray" }).events;
    expect(events.filter((event) => event.type === "service.restart_failed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "service.restart_started")).toHaveLength(1);
  });
});
