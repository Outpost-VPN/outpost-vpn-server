import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConnectionService } from "../src/server/services/connections";
import { TrafficService, parseXrayStats, periodStart } from "../src/server/services/traffic";
import { database } from "./helpers";

describe("traffic accounting", () => {
  let fixture: ReturnType<typeof database>;
  beforeEach(() => { fixture = database(); });
  afterEach(() => fixture.close());

  test("filters ranges and connections, bounds automatic series and preserves exact totals", () => {
    const connections = new ConnectionService(fixture.db), first = connections.create({name: "First"}), second = connections.create({name: "Second"});
    const traffic = new TrafficService(fixture.db);
    for (const [index, time] of ["2026-08-13T00:30:00Z", "2026-08-13T01:25:00Z", "2026-08-13T02:00:00Z"].entries()) {
      traffic.recordCumulative("xray", {connectionId: first.id, upload: (index + 1) * 10, download: (index + 1) * 20}, new Date(time));
      traffic.recordCumulative("xray", {connectionId: second.id, upload: (index + 1) * 100, download: (index + 1) * 200}, new Date(time));
    }
    const options = {connectionId: first.id, from: "2026-08-13T00:30:00.000Z", to: "2026-08-13T01:29:00.000Z", maxPoints: 1};
    const filtered = traffic.overview("all", "UTC", options);
    expect(filtered.totals).toEqual({upload: 20, download: 40});
    expect(filtered.connections).toHaveLength(1); expect(filtered.series).toHaveLength(1);
    expect(filtered.series[0]).toMatchObject({upload: 20, download: 40});
    expect(traffic.overview("all", "UTC", {...options, includeSeries: false}).series).toEqual([]);
    expect(() => traffic.overview("all", "UTC", {...options, resolution: "5m"})).toThrow("maxPoints");
  });

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
