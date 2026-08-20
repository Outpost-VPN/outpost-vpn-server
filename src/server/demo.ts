import type { HttpApplication } from "./http";

export async function seedDemo(app: HttpApplication) {
  const existing = app.connections.list();
  if (!existing.length) {
    const fixtures = [
      { name: "Мама", color: "peach" as const, avatar: "avatar-8" },
      { name: "Семья", color: "blue" as const, avatar: "avatar-group" },
      { name: "Знакомый из поезда", color: "green" as const, avatar: "avatar-person" },
    ];
    for (const fixture of fixtures) {
      const connection = app.connections.create(fixture, "demo");
      await app.connectionSync.activate(connection.id);
    }
  }
  seedPresence(app);
  seedJournal(app);
  app.traffic.seedDemo();
}

function seedPresence(app: HttpApplication) {
  const connections = app.db.raw.query<{ id: string; name: string }, []>(`
    SELECT id, name FROM connections WHERE status = 'active' ORDER BY created_at
  `).all();
  if (!connections.length) return;
  const timestamp = new Date();
  const insert = app.db.raw.query(`
    INSERT INTO connection_presence (
      connection_id, engine, status, signal, connections, misses, last_active_at, observed_at, changed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(connection_id, engine) DO NOTHING
  `);
  app.db.raw.transaction(() => {
    connections.forEach((connection, index) => {
      const seen = new Date(timestamp.getTime() - (index + 1) * 18 * 60 * 1000).toISOString();
      const status = index === connections.length - 1 ? "unknown" : index === connections.length - 2 ? "offline" : "online";
      const xrayStatus = status === "unknown" ? "unknown" : status === "online" && index % 2 === 1 ? "online" : "offline";
      const xrayActive = xrayStatus === "online" ? new Date(timestamp.getTime() - 60_000).toISOString() : seen;
      app.db.raw.query(`
        UPDATE connections SET first_seen_at = COALESCE(first_seen_at, ?), last_seen_at = COALESCE(last_seen_at, ?)
        WHERE id = ?
      `).run(seen, seen, connection.id);
      insert.run(connection.id, "hysteria", status, "connections", status === "online" ? 1 : 0, status === "offline" ? 2 : 0, status === "online" ? seen : null, timestamp.toISOString(), seen);
      insert.run(connection.id, "xray", xrayStatus, "traffic", null, 0, xrayActive, timestamp.toISOString(), seen);
    });
  })();
}

function seedJournal(app: HttpApplication) {
  const existing = app.db.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM events WHERE type = 'backup.created'").get()?.count ?? 0;
  if (existing) return;
  const connection = app.db.raw.query<{ id: string; name: string }, []>(`
    SELECT id, name FROM connections ORDER BY created_at LIMIT 1
  `).get();
  if (connection) {
    app.journal.record("connection.first_seen", {
      actor: "telemetry",
      subjectType: "connection",
      subjectId: connection.id,
      data: { connectionName: connection.name },
    });
  }
  app.journal.record("auth.login_succeeded", { actor: "demo", data: { browser: "Safari", os: "macOS" } });
  app.journal.record("engine.config_applied", { actor: "demo", source: "xray", subjectType: "engine", subjectId: "xray", data: { engine: "xray", version: 7 } });
  app.journal.record("backup.created", { actor: "system", data: { size: 733_184, encrypted: true } });
}
