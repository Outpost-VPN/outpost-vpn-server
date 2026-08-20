import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConnectionService } from "../src/server/services/connections";
import { TrafficService, parseXrayStats, periodStart } from "../src/server/services/traffic";
import { database } from "./helpers";

describe("traffic accounting", () => {
  let fixture: ReturnType<typeof database>;
  beforeEach(() => { fixture = database(); });
  afterEach(() => fixture.close());

  test("computes connection deltas and handles engine counter resets", () => {
    const connections = new ConnectionService(fixture.db);
    const connection = connections.create({ name: "Тест" });
    const service = new TrafficService(fixture.db);
    const date = new Date("2026-08-13T10:00:00Z");
    service.recordCumulative("hysteria", { connectionId: connection.id, upload: 100, download: 500 }, date);
    service.recordCumulative("hysteria", { connectionId: connection.id, upload: 180, download: 900 }, date);
    service.recordCumulative("hysteria", { connectionId: connection.id, upload: 20, download: 30 }, date);
    const overview = service.overview("all");
    expect(overview.totals).toEqual({ upload: 200, download: 930 });
    expect(overview.connections[0]).toMatchObject({ connection_id: connection.id, upload: 200, download: 930 });
    expect(overview.connections[0]!.series).toHaveLength(1);
    expect(overview).not.toHaveProperty("people");
    expect(fixture.db.raw.query("SELECT connection_id, engine FROM traffic_samples LIMIT 1").get()).toEqual({
      connection_id: connection.id,
      engine: "hysteria",
    });
  });

  test("parses Xray user counters", () => {
    const stats = parseXrayStats(JSON.stringify({ stat: [
      { name: "user>>>connection.1@outpost.local>>>traffic>>>uplink", value: "123" },
      { name: "user>>>connection.1@outpost.local>>>traffic>>>downlink", value: 456 },
    ] }));
    expect(stats.get("user>>>connection.1@outpost.local>>>traffic>>>uplink")).toBe(123);
  });

  test("uses the owner timezone for calendar periods", () => {
    const reference = new Date("2026-08-13T22:30:00Z");
    expect(periodStart("today", "Europe/Moscow", reference)).toBe("2026-08-13T21:00:00.000Z");
    expect(periodStart("week", "Europe/Moscow", reference)).toBe("2026-08-09T21:00:00.000Z");
    expect(periodStart("month", "Europe/Moscow", reference)).toBe("2026-07-31T21:00:00.000Z");
    expect(periodStart("year", "Europe/Moscow", reference)).toBe("2025-12-31T21:00:00.000Z");
  });
});
