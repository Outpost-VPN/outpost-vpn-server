import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PeopleService } from "../src/server/services/people";
import { TrafficService, parseXrayStats, periodStart } from "../src/server/services/traffic";
import { database } from "./helpers";

describe("traffic accounting", () => {
  let fixture: ReturnType<typeof database>;
  beforeEach(() => { fixture = database(); });
  afterEach(() => fixture.close());

  test("computes deltas and handles engine counter resets", () => {
    const people = new PeopleService(fixture.db);
    const person = people.create({ name: "Тест" });
    const created = people.createDevice(person.id, { name: "iPhone", platform: "ios", client: "incy" });
    const service = new TrafficService(fixture.db);
    const date = new Date("2026-08-13T10:00:00Z");
    service.recordCumulative("hysteria", { deviceId: created.device.id, upload: 100, download: 500 }, date);
    service.recordCumulative("hysteria", { deviceId: created.device.id, upload: 180, download: 900 }, date);
    service.recordCumulative("hysteria", { deviceId: created.device.id, upload: 20, download: 30 }, date);
    expect(service.overview("all").totals).toEqual({ upload: 200, download: 930 });
  });

  test("parses Xray user counters", () => {
    const stats = parseXrayStats(JSON.stringify({ stat: [
      { name: "user>>>device@matreshka.local>>>traffic>>>uplink", value: "123" },
      { name: "user>>>device@matreshka.local>>>traffic>>>downlink", value: 456 },
    ] }));
    expect(stats.get("user>>>device@matreshka.local>>>traffic>>>uplink")).toBe(123);
  });

  test("uses the owner timezone for calendar periods", () => {
    const reference = new Date("2026-08-13T22:30:00Z");
    expect(periodStart("today", "Europe/Moscow", reference)).toBe("2026-08-13T21:00:00.000Z");
    expect(periodStart("week", "Europe/Moscow", reference)).toBe("2026-08-09T21:00:00.000Z");
    expect(periodStart("month", "Europe/Moscow", reference)).toBe("2026-07-31T21:00:00.000Z");
    expect(periodStart("year", "Europe/Moscow", reference)).toBe("2025-12-31T21:00:00.000Z");
  });
});
