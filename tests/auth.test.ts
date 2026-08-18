import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AuthService } from "../src/server/auth/webauthn";
import { createToken, hashToken } from "../src/server/security";
import { database } from "./helpers";

describe("owner security", () => {
  let fixture: ReturnType<typeof database>;
  let auth: AuthService;

  beforeEach(() => {
    fixture = database();
    auth = new AuthService(fixture.db);
    const created = new Date().toISOString();
    fixture.db.raw.query("INSERT INTO owners (id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("owner", "Федор", "Europe/Moscow", created, created);
    for (const id of ["passkey-1", "passkey-2"]) {
      fixture.db.raw.query(`
        INSERT INTO passkeys (id, owner_id, public_key, counter, transports_json, device_type, backed_up, created_at)
        VALUES (?, ?, ?, 0, '[]', 'multiDevice', 1, ?)
      `).run(id, "owner", new Uint8Array([1, 2, 3]), created);
    }
  });

  afterEach(() => fixture.close());

  test("marks the current session and ends the others", () => {
    const created = new Date().toISOString();
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    const current = createToken();
    const other = createToken();
    const insert = fixture.db.raw.query(`
      INSERT INTO sessions (id, owner_id, token_hash, expires_at, created_at, last_seen_at, user_agent)
      VALUES (?, 'owner', ?, ?, ?, ?, ?)
    `);
    insert.run("session-current", hashToken(current), expires, created, created, "Safari macOS");
    insert.run("session-other", hashToken(other), expires, created, created, "Safari iPhone");

    expect(auth.security(current).sessions).toEqual([
      expect.objectContaining({ id: "session-current", current: true }),
      expect.objectContaining({ id: "session-other", current: false }),
    ]);
    expect(auth.endOtherSessions(current).revoked).toBe(1);
    expect(auth.security(current).sessions).toHaveLength(1);
  });

  test("revokes one non-current session", () => {
    const created = new Date().toISOString();
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    const current = createToken();
    const other = createToken();
    const insert = fixture.db.raw.query(`
      INSERT INTO sessions (id, owner_id, token_hash, expires_at, created_at, last_seen_at, user_agent)
      VALUES (?, 'owner', ?, ?, ?, ?, ?)
    `);
    insert.run("session-current", hashToken(current), expires, created, created, "Safari macOS");
    insert.run("session-other", hashToken(other), expires, created, created, "Safari iPhone");

    auth.revokeSession("session-other", current);
    expect(auth.security(current).sessions).toEqual([
      expect.objectContaining({ id: "session-current", current: true }),
    ]);
    expect(() => auth.revokeSession("session-current", current)).toThrow("Текущую сессию");
  });

  test("never revokes the owner's final passkey", () => {
    auth.revokePasskey("passkey-1");
    expect(() => auth.revokePasskey("passkey-2")).toThrow("единственный passkey");
  });
});

describe("WebAuthn challenge storage", () => {
  test("stores a bootstrap proof instead of the raw bootstrap token and prunes expired challenges", async () => {
    const fixture = database();
    try {
      const auth = new AuthService(fixture.db);
      const bootstrapUrl = auth.ensureBootstrap();
      const bootstrapToken = new URL(bootstrapUrl!).searchParams.get("bootstrap")!;
      fixture.db.raw.query(`
        INSERT INTO webauthn_challenges (id, kind, challenge, context_json, expires_at, created_at)
        VALUES ('expired', 'registration', 'expired', '{}', ?, ?)
      `).run(new Date(Date.now() - 1_000).toISOString(), new Date(Date.now() - 2_000).toISOString());

      await auth.registrationOptions({ name: "Федор", timezone: "Europe/Moscow", bootstrapToken });

      const rows = fixture.db.raw.query<{ id: string; context_json: string }, []>(
        "SELECT id, context_json FROM webauthn_challenges",
      ).all();
      expect(rows.some((row) => row.id === "expired")).toBeFalse();
      expect(JSON.stringify(rows)).not.toContain(bootstrapToken);
      expect(JSON.parse(rows[0]!.context_json)).toMatchObject({ name: "Федор", timezone: "Europe/Moscow" });
      expect(JSON.parse(rows[0]!.context_json).bootstrapHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      fixture.close();
    }
  });
});
