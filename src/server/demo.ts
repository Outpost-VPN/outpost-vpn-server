import type { HttpApplication } from "./http";

export async function seedDemo(app: HttpApplication) {
  const existing = app.people.list();
  if (existing.length) {
    seedPresence(app);
    seedJournal(app);
    app.traffic.seedDemo();
    return;
  }
  const fixtures = [
    { name: "Мама", color: "peach" as const, avatar: "avatar-8", devices: [{ name: "iPhone", kind: "phone" as const, platform: "ios" as const, client: "incy" as const }, { name: "iPad", kind: "tablet" as const, platform: "ios" as const, client: "incy" as const }] },
    { name: "Папа", color: "blue" as const, avatar: "avatar-4", devices: [{ name: "iPhone", kind: "phone" as const, platform: "ios" as const, client: "incy" as const }] },
    { name: "Алексей", color: "green" as const, avatar: "avatar-3", devices: [{ name: "Телефон", kind: "phone" as const, platform: "android" as const, client: "mihomo" as const }, { name: "Ноутбук", kind: "computer" as const, platform: "windows" as const, client: "mihomo" as const }] },
  ];
  for (const fixture of fixtures) {
    const person = app.people.create({ name: fixture.name, color: fixture.color, avatar: fixture.avatar }, "demo");
    for (const device of fixture.devices) {
      const created = app.people.createDevice(person.id, device, "demo");
      const token = created.invitation.url.split("/").at(-1)!;
      await app.deviceSync.redeem(token);
    }
  }
  app.routes.publish("Первоначальные правила", "demo");
  seedPresence(app);
  seedJournal(app);
  app.traffic.seedDemo();
}

function seedPresence(app: HttpApplication) {
  const devices = app.db.raw.query<{ id: string; name: string }, []>("SELECT id, name FROM devices WHERE status = 'active' ORDER BY created_at").all();
  if (!devices.length) return;
  const timestamp = new Date();
  const insert = app.db.raw.query(`
    INSERT INTO device_presence (
      device_id, engine, status, signal, connections, misses, last_active_at, observed_at, changed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(device_id, engine) DO NOTHING
  `);
  app.db.raw.transaction(() => {
    devices.forEach((device, index) => {
      const seen = new Date(timestamp.getTime() - (index + 1) * 18 * 60 * 1000).toISOString();
      const status = index === devices.length - 1 ? "unknown" : index === devices.length - 2 ? "offline" : "online";
      const xrayStatus = status === "unknown" ? "unknown" : status === "online" && index % 2 === 1 ? "online" : "offline";
      const xrayActive = xrayStatus === "online" ? new Date(timestamp.getTime() - 60_000).toISOString() : seen;
      app.db.raw.query(`
        UPDATE devices SET first_seen_at = COALESCE(first_seen_at, ?), last_seen_at = COALESCE(last_seen_at, ?)
        WHERE id = ?
      `).run(seen, seen, device.id);
      insert.run(device.id, "hysteria", status, "connections", status === "online" ? 1 : 0, status === "offline" ? 2 : 0, status === "online" ? seen : null, timestamp.toISOString(), seen);
      insert.run(device.id, "xray", xrayStatus, "traffic", null, 0, xrayActive, timestamp.toISOString(), seen);
    });
  })();
}

function seedJournal(app: HttpApplication) {
  const existing = app.db.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM events WHERE type = 'backup.created'").get()?.count ?? 0;
  if (existing) return;
  const devices = app.db.raw.query<{ id: string; name: string; person_name: string }, []>(`
    SELECT devices.id, devices.name, people.name AS person_name
    FROM devices JOIN people ON people.id = devices.person_id ORDER BY devices.created_at
  `).all();
  const device = devices.at(0);
  if (device) {
    app.journal.record("device.first_seen", {
      actor: "telemetry",
      subjectType: "device",
      subjectId: device.id,
      data: { deviceName: device.name, personName: device.person_name },
    });
  }
  app.journal.record("auth.login_succeeded", { actor: "demo", data: { browser: "Safari", os: "macOS" } });
  app.journal.record("engine.config_applied", { actor: "demo", source: "xray", subjectType: "engine", subjectId: "xray", data: { engine: "xray", version: 7 } });
  app.journal.record("backup.created", { actor: "system", data: { size: 733_184, encrypted: true } });
}
