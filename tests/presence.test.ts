import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConnectionService } from "../src/server/services/connections";
import { ConnectionSyncService } from "../src/server/services/connection-sync";
import { JournalService } from "../src/server/services/journal";
import { TrafficService, type TelemetrySnapshot, type TrafficCollector } from "../src/server/services/traffic";
import { database } from "./helpers";

class StubCollector implements TrafficCollector {
  snapshot: TelemetrySnapshot = { traffic: [] };
  error: Error | null = null;
  constructor(readonly id: "hysteria" | "xray") {}
  async collect() {
    if (this.error) throw this.error;
    return this.snapshot;
  }
}

describe("connection presence telemetry", () => {
  let fixture: ReturnType<typeof database>;
  let connections: ConnectionService;
  let connectionId: string;
  let hysteria: StubCollector;
  let xray: StubCollector;
  let traffic: TrafficService;

  beforeEach(async () => {
    fixture = database();
    connections = new ConnectionService(fixture.db);
    const connection = connections.create({ name: "Семья" });
    const sync = new ConnectionSyncService(fixture.db, connections, {
      async add() { return { ok: true }; },
      async rotate() { return { ok: true }; },
      async revoke() { return { ok: true }; },
    });
    await sync.activate(connection.id);
    connectionId = connection.id;
    hysteria = new StubCollector("hysteria");
    xray = new StubCollector("xray");
    traffic = new TrafficService(fixture.db, [hysteria, xray]);
  });
  afterEach(() => fixture.close());

  test("records combined clients as one online connection", async () => {
    const at = new Date("2026-08-17T10:00:00.000Z");
    hysteria.snapshot = { traffic: [], online: { [connectionId]: 3 } };
    await traffic.collect(at);
    expect(connections.get(connectionId).presence).toMatchObject({
      status: "online",
      engines: { hysteria: { connections: 3 } },
    });
    expect(connections.get(connectionId).last_seen_at).toBe(at.toISOString());
  });

  test("uses Xray deltas and ignores counter resets", async () => {
    const start = new Date("2026-08-17T10:00:00.000Z");
    hysteria.snapshot = { traffic: [], online: {} };
    xray.snapshot = { traffic: [{ connectionId, upload: 100, download: 200 }] };
    await traffic.collect(start);
    expect(connections.get(connectionId).presence?.engines.xray?.status).toBe("offline");
    xray.snapshot = { traffic: [{ connectionId, upload: 110, download: 250 }] };
    await traffic.collect(new Date(start.getTime() + 30_000));
    const activeAt = connections.get(connectionId).presence?.engines.xray?.last_active_at;
    expect(connections.get(connectionId).presence?.engines.xray?.status).toBe("online");
    xray.snapshot = { traffic: [{ connectionId, upload: 2, download: 3 }] };
    await traffic.collect(new Date(start.getTime() + 60_000));
    expect(connections.get(connectionId).presence?.engines.xray?.last_active_at).toBe(activeAt);
  });

  test("emits first seen, long absence and return once per connection", async () => {
    const journal = new JournalService(fixture.db);
    const start = new Date("2026-08-15T08:00:00.000Z");
    hysteria.snapshot = { traffic: [], online: { [connectionId]: 2 } };
    await traffic.collect(start);
    await traffic.collect(new Date(start.getTime() + 30_000));
    expect(journal.list().events.filter((event) => event.type === "connection.first_seen")).toHaveLength(1);

    hysteria.snapshot = { traffic: [], online: {} };
    await traffic.collect(new Date(start.getTime() + 60_000));
    await traffic.collect(new Date(start.getTime() + 90_000));
    await traffic.collect(new Date(start.getTime() + 25 * 60 * 60 * 1000));
    await traffic.collect(new Date(start.getTime() + 26 * 60 * 60 * 1000));
    expect(journal.list().events.filter((event) => event.type === "connection.offline_long")).toHaveLength(1);

    hysteria.snapshot = { traffic: [], online: { [connectionId]: 1 } };
    await traffic.collect(new Date(start.getTime() + 27 * 60 * 60 * 1000));
    await traffic.collect(new Date(start.getTime() + 28 * 60 * 60 * 1000));
    expect(journal.list().events.filter((event) => event.type === "connection.returned")).toHaveLength(1);
  });

  test("telemetry errors produce unknown without an offline incident", async () => {
    const start = new Date("2026-08-15T08:00:00.000Z");
    hysteria.snapshot = { traffic: [], online: { [connectionId]: 1 } };
    await traffic.collect(start);
    hysteria.error = new Error("unavailable");
    xray.error = new Error("unavailable");
    await traffic.collect(new Date(start.getTime() + 25 * 60 * 60 * 1000));
    expect(connections.get(connectionId).presence?.status).toBe("unknown");
    expect(new JournalService(fixture.db).list().events.some((event) => event.type === "connection.offline_long")).toBeFalse();
  });
});
