import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PeopleService } from "../src/server/services/people";
import { TrafficService, type TelemetrySnapshot, type TrafficCollector } from "../src/server/services/traffic";
import { JournalService } from "../src/server/services/journal";
import { database } from "./helpers";
import { DeviceSyncService } from "../src/server/services/device-sync";

class StubCollector implements TrafficCollector {
  snapshot: TelemetrySnapshot = { traffic: [] };
  error: Error | null = null;

  constructor(readonly id: "hysteria" | "xray") {}

  async collect() {
    if (this.error) throw this.error;
    return this.snapshot;
  }
}

describe("device presence telemetry", () => {
  let fixture: ReturnType<typeof database>;
  let people: PeopleService;
  let device: ReturnType<PeopleService["device"]>;
  let hysteria: StubCollector;
  let xray: StubCollector;
  let traffic: TrafficService;

  beforeEach(async () => {
    fixture = database();
    people = new PeopleService(fixture.db);
    const person = people.create({ name: "Мама" });
    const created = people.createDevice(person.id, { name: "iPhone", platform: "ios", client: "incy" });
    const sync = new DeviceSyncService(fixture.db, people, {
      async add() { return { ok: true }; },
      async revoke() { return { ok: true }; },
    });
    const redeemed = await sync.redeem(created.invitation.url.split("/").at(-1)!);
    if (redeemed.pending) throw new Error("Device activation did not complete");
    device = redeemed.device;
    hysteria = new StubCollector("hysteria");
    xray = new StubCollector("xray");
    traffic = new TrafficService(fixture.db, [hysteria, xray]);
  });
  afterEach(() => fixture.close());

  test("uses Hysteria online connections and two successful misses", async () => {
    const start = new Date("2026-08-17T10:00:00.000Z");
    hysteria.snapshot = { traffic: [], online: { [device.id]: 2 } };
    await traffic.collect(start);
    expect(people.device(device.id).presence).toMatchObject({ status: "online", engines: { hysteria: { status: "online", connections: 2 } } });

    hysteria.snapshot = { traffic: [], online: {} };
    await traffic.collect(new Date(start.getTime() + 30_000));
    expect(people.device(device.id).presence?.engines.hysteria?.status).toBe("online");
    await traffic.collect(new Date(start.getTime() + 60_000));
    expect(people.device(device.id).presence?.engines.hysteria?.status).toBe("offline");
  });

  test("uses Xray deltas, ignores resets and expires activity after two minutes", async () => {
    const start = new Date("2026-08-17T10:00:00.000Z");
    hysteria.snapshot = { traffic: [], online: {} };
    xray.snapshot = { traffic: [{ deviceId: device.id, upload: 100, download: 200 }] };
    await traffic.collect(start);
    expect(people.device(device.id).presence?.engines.xray?.status).toBe("offline");

    xray.snapshot = { traffic: [{ deviceId: device.id, upload: 110, download: 250 }] };
    await traffic.collect(new Date(start.getTime() + 30_000));
    const activeAt = people.device(device.id).presence?.engines.xray?.last_active_at ?? null;
    expect(people.device(device.id).presence?.engines.xray?.status).toBe("online");

    xray.snapshot = { traffic: [{ deviceId: device.id, upload: 2, download: 3 }] };
    await traffic.collect(new Date(start.getTime() + 60_000));
    expect(people.device(device.id).presence?.engines.xray?.last_active_at).toBe(activeAt);
    expect(people.device(device.id).last_seen_at).toBe(activeAt);
    await traffic.collect(new Date(start.getTime() + 3 * 60_000));
    expect(people.device(device.id).presence?.engines.xray?.status).toBe("offline");
  });

  test("aggregates unknown, deduplicates long absence and records return once", async () => {
    const journal = new JournalService(fixture.db);
    const start = new Date("2026-08-15T08:00:00.000Z");
    hysteria.snapshot = { traffic: [], online: { [device.id]: 1 } };
    await traffic.collect(start);
    await traffic.collect(new Date(start.getTime() + 30_000));
    expect(journal.list({ q: "впервые в сети" }).events).toHaveLength(1);

    hysteria.error = new Error("unavailable");
    await traffic.collect(new Date(start.getTime() + 60_000));
    expect(people.device(device.id).presence?.status).toBe("unknown");

    hysteria.error = null;
    hysteria.snapshot = { traffic: [], online: {} };
    await traffic.collect(new Date(start.getTime() + 90_000));
    await traffic.collect(new Date(start.getTime() + 120_000));
    await traffic.collect(new Date(start.getTime() + 25 * 60 * 60 * 1000));
    await traffic.collect(new Date(start.getTime() + 26 * 60 * 60 * 1000));
    expect(journal.list({ q: "давно не выходило" }).events).toHaveLength(1);

    hysteria.snapshot = { traffic: [], online: { [device.id]: 1 } };
    await traffic.collect(new Date(start.getTime() + 27 * 60 * 60 * 1000));
    await traffic.collect(new Date(start.getTime() + 27 * 60 * 60 * 1000 + 30_000));
    expect(journal.list({ q: "вернулось" }).events).toHaveLength(1);
  });

  test("collector failures become unknown and incident/recovery do not spam", async () => {
    const journal = new JournalService(fixture.db);
    const start = new Date("2026-08-17T10:00:00.000Z");
    hysteria.error = new Error("stats unavailable");
    await traffic.collect(start);
    await traffic.collect(new Date(start.getTime() + 30_000));
    await traffic.collect(new Date(start.getTime() + 60_000));
    expect(journal.list({ q: "Телеметрия Hysteria" }).events.filter((event) => event.type === "engine.telemetry_unavailable")).toHaveLength(1);

    hysteria.error = null;
    hysteria.snapshot = { traffic: [], online: {} };
    await traffic.collect(new Date(start.getTime() + 90_000));
    await traffic.collect(new Date(start.getTime() + 120_000));
    expect(journal.list({ q: "Телеметрия Hysteria" }).events.filter((event) => event.type === "engine.telemetry_restored")).toHaveLength(1);
  });
});
