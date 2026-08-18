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
      services: { "matreshka": false, nginx: true, "hysteria-server": true, xray: true },
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
    expect(journal.list({ q: "Служба «Matreshka» недоступна" }).events).toHaveLength(1);

    snapshot = { ...snapshot, services: { ...snapshot.services, "matreshka": true } };
    await monitoring.collect(at(3));
    await monitoring.collect(at(4));
    expect(journal.list({ q: "Matreshka снова работает" }).events).toHaveLength(1);
  });

  test("tracks disk and TLS warning, critical and recovery thresholds", async () => {
    let snapshot: MonitoringSnapshot = {
      services: { "matreshka": true, nginx: true, "hysteria-server": true, xray: true },
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
      services: { "matreshka": true, nginx: true, "hysteria-server": true, xray: true },
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
});
