import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JournalService } from "../src/server/services/journal";
import { MonitoringService, type MonitoringSnapshot } from "../src/server/services/monitoring";
import { database } from "./helpers";

describe("system monitoring", () => {
  let fixture: ReturnType<typeof database>;
  beforeEach(() => { fixture = database(); });
  afterEach(() => fixture.close());

  test("emits one incident after two failures and one recovery", async () => {
    let snapshot: MonitoringSnapshot = {
      services: { "outpost": false, nginx: true, "hysteria-server": true, xray: true },
      diskPercent: 40,
      tlsDays: 60,
    };
    const monitoring = new MonitoringService(fixture.db, undefined, async () => snapshot);
    const journal = new JournalService(fixture.db);
    const at = (minute: number) => new Date(`2026-08-17T10:${String(minute).padStart(2, "0")}:00.000Z`);

    await monitoring.collect(at(0));
    expect(journal.list({ q: "недоступна" }).events).toHaveLength(0);
    await monitoring.collect(at(1));
    await monitoring.collect(at(2));
    expect(journal.list({ q: "Служба «Outpost» недоступна" }).events).toHaveLength(1);

    snapshot = { ...snapshot, services: { ...snapshot.services, "outpost": true } };
    await monitoring.collect(at(3));
    await monitoring.collect(at(4));
    expect(journal.list({ q: "Outpost снова работает" }).events).toHaveLength(1);
  });

  test("tracks disk and TLS warning, critical and recovery thresholds", async () => {
    let snapshot: MonitoringSnapshot = {
      services: { "outpost": true, nginx: true, "hysteria-server": true, xray: true },
      diskPercent: 86,
      tlsDays: 20,
    };
    const monitoring = new MonitoringService(fixture.db, undefined, async () => snapshot);
    const journal = new JournalService(fixture.db);
    const at = (minute: number) => new Date(`2026-08-17T10:${String(minute).padStart(2, "0")}:00.000Z`);

    await monitoring.collect(at(0));
    await monitoring.collect(at(1));
    expect(journal.list({ scope: "important" }).events.map((event) => event.type)).toContainAllValues(["system.disk_warning", "system.tls_warning"]);

    snapshot = { ...snapshot, diskPercent: 96, tlsDays: 5 };
    await monitoring.collect(at(2));
    await monitoring.collect(at(3));
    expect(journal.list({ scope: "errors" }).events.map((event) => event.type)).toContainAllValues(["system.disk_critical", "system.tls_critical"]);

    snapshot = { ...snapshot, diskPercent: 79, tlsDays: 45 };
    await monitoring.collect(at(4));
    expect(journal.latest(2).map((event) => event.type)).toContainAllValues(["system.disk_restored", "system.tls_restored"]);
  });

  test("keeps a compact rolling network-rate history in the monitor snapshot", async () => {
    let snapshot: MonitoringSnapshot = {
      services: { "outpost": true, nginx: true, "hysteria-server": true, xray: true },
      diskPercent: 40,
      tlsDays: 60,
      metrics: {
        cpu: { percent: 18 },
        memory: { used: 1, total: 2, percent: 50 },
        network: { received: 1_000_000, transmitted: 500_000 },
      },
    };
    const monitoring = new MonitoringService(fixture.db, undefined, async () => snapshot);

    await monitoring.collect(new Date("2026-08-17T10:00:00.000Z"));
    snapshot = {
      ...snapshot,
      metrics: { ...snapshot.metrics!, network: { received: 1_060_000, transmitted: 530_000 } },
    };
    await monitoring.collect(new Date("2026-08-17T10:01:00.000Z"));

    const stored = fixture.db.setting<{
      metrics: { network: { download: number; upload: number; history: unknown[] } };
    }>("monitor_snapshot", { metrics: { network: { download: 0, upload: 0, history: [] } } });
    expect(stored.metrics.network.download).toBe(1_000);
    expect(stored.metrics.network.upload).toBe(500);
    expect(stored.metrics.network.history).toHaveLength(2);
  });

  test("keeps the concrete TLS probe error in the public monitor snapshot", async () => {
    const monitoring = new MonitoringService(fixture.db, undefined, async () => ({
      services: { "outpost": true, nginx: true, "hysteria-server": true, xray: true },
      diskPercent: 40,
      tlsDays: null,
      tlsError: "HTTPS на порту 443 не отвечает",
    }));

    await monitoring.collect(new Date("2026-08-17T10:00:00.000Z"));

    expect(fixture.db.setting<{ tls: { status: string; error: string } }>("monitor_snapshot", { tls: { status: "", error: "" } }).tls)
      .toMatchObject({ status: "unknown", error: "HTTPS на порту 443 не отвечает" });
  });

  test("reports XHTTP and gRPC listeners separately", async () => {
    const snapshot: MonitoringSnapshot = {
      services: { "outpost": true, nginx: true, "hysteria-server": true, xray: true },
      transports: { xhttp: true, grpc: false },
      diskPercent: 40,
      tlsDays: 60,
    };
    const monitoring = new MonitoringService(fixture.db, undefined, async () => snapshot);
    await monitoring.collect(new Date("2026-08-17T10:00:00.000Z"));
    await monitoring.collect(new Date("2026-08-17T10:01:00.000Z"));

    expect(fixture.db.setting<{ transports: { xhttp: boolean; grpc: boolean } }>("monitor_snapshot", { transports: { xhttp: false, grpc: true } }).transports)
      .toEqual({ xhttp: true, grpc: false });
    expect(new JournalService(fixture.db).list({ q: "VLESS gRPC" }).events.map((event) => event.type))
      .toContain("service.unavailable");
  });

  test("refreshes live service states without replacing the rest of the monitor snapshot", async () => {
    fixture.db.setSetting("monitor_snapshot", {
      services: [{ name: "xray", status: "inactive" }],
      tls: { status: "valid", expiresAt: "2026-09-01T00:00:00.000Z" },
      metrics: { cpu: { percent: 12 } },
      checkedAt: "2026-08-17T10:00:00.000Z",
    });
    const monitoring = new MonitoringService(
      fixture.db,
      undefined,
      async () => { throw new Error("full probe should not run"); },
      async () => ({ outpost: true, nginx: true, "hysteria-server": false, xray: true }),
    );

    await monitoring.refreshServices(new Date("2026-08-17T10:00:10.000Z"));

    const stored = fixture.db.setting<{
      services: Array<{ name: string; status: string }>;
      tls: { status: string; expiresAt: string };
      metrics: { cpu: { percent: number } };
      checkedAt: string;
    }>("monitor_snapshot", { services: [], tls: { status: "", expiresAt: "" }, metrics: { cpu: { percent: 0 } }, checkedAt: "" });
    expect(stored.services).toEqual([
      { name: "outpost", status: "active" },
      { name: "nginx", status: "active" },
      { name: "hysteria-server", status: "inactive" },
      { name: "xray", status: "active" },
    ]);
    expect(stored.tls).toEqual({ status: "valid", expiresAt: "2026-09-01T00:00:00.000Z" });
    expect(stored.metrics).toEqual({ cpu: { percent: 12 } });
    expect(stored.checkedAt).toBe("2026-08-17T10:00:10.000Z");
  });
});
