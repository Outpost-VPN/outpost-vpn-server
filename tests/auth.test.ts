import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AuthService } from "../src/server/auth/webauthn";
import { createToken, hashToken } from "../src/server/security";
import { database } from "./helpers";

const acceptedRegistration = async () => ({
  verified: true as const,
  registrationInfo: {
    fmt: "none" as const,
    aaguid: "00000000-0000-0000-0000-000000000000",
    credential: {
      id: "credential-1",
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
      transports: [],
    },
    credentialType: "public-key" as const,
    attestationObject: new Uint8Array(),
    userVerified: true,
    credentialDeviceType: "singleDevice" as const,
    credentialBackedUp: false,
    origin: "http://localhost:8181",
    rpID: "localhost",
  },
});

describe("owner security", () => {
  let fixture: ReturnType<typeof database>;
  let auth: AuthService;

  beforeEach(() => {
    fixture = database();
    auth = new AuthService(fixture.db);
    const created = new Date().toISOString();
    fixture.db.raw.query("INSERT INTO owners (id, timezone, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("owner", "Europe/Moscow", created, created);
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

describe("owner invitations", () => {
  let fixture: ReturnType<typeof database>;
  let auth: AuthService;
  let ownerId: string;

  beforeEach(() => {
    fixture = database();
    auth = new AuthService(fixture.db, undefined, acceptedRegistration);
    ownerId = crypto.randomUUID();
    const created = new Date().toISOString();
    fixture.db.raw.query("INSERT INTO owners (id, timezone, language, created_at, updated_at) VALUES (?, 'Europe/Moscow', 'ru', ?, ?)")
      .run(ownerId, created, created);
    fixture.db.raw.query(`
      INSERT INTO passkeys (id, owner_id, public_key, counter, transports_json, created_at)
      VALUES ('original', ?, ?, 0, '[]', ?)
    `).run(ownerId, new Uint8Array([1, 2, 3]), created);
  });

  afterEach(() => fixture.close());

  test("uses a single-use link to add a named passkey and revokes its sessions", async () => {
    const invitation = auth.createInvitation("Оператор");
    const token = new URL(invitation.url).searchParams.get("token")!;
    const stored = fixture.db.raw.query<{ token_hash: string }, string>(
      "SELECT token_hash FROM owner_invitations WHERE id = ?",
    ).get(invitation.id)!;
    expect(new URL(invitation.url).pathname).toBe("/admin/invite");
    expect(stored.token_hash).toBe(hashToken(token));
    expect(JSON.stringify(auth.security())).not.toContain(token);

    const first = await auth.registrationOptions({ inviteToken: token, timezone: "Pacific/Honolulu", language: "en" });
    const second = await auth.registrationOptions({ inviteToken: token });
    const context = fixture.db.raw.query<{ context_json: string }, string>(
      "SELECT context_json FROM webauthn_challenges WHERE id = ?",
    ).get(first.challengeId)!;
    expect(JSON.parse(context.context_json)).toMatchObject({
      ownerId, timezone: "Europe/Moscow", language: "ru", authority: "invite",
      invitationId: invitation.id, tokenHash: hashToken(token),
    });
    expect(context.context_json).not.toContain(token);

    const session = await auth.finishRegistration(first.challengeId, {} as never);
    expect(session.token).toBeTruthy();
    expect(fixture.db.raw.query<{ label: string }, string>("SELECT label FROM passkeys WHERE id = ?").get("credential-1")?.label).toBe("Оператор");
    expect(fixture.db.raw.query<{ passkey_id: string }, string>("SELECT passkey_id FROM sessions WHERE token_hash = ?").get(hashToken(session.token))?.passkey_id).toBe("credential-1");
    expect(auth.security().invitations).toEqual([]);
    await expect(auth.registrationOptions({ inviteToken: token })).rejects.toThrow("Приглашение недействительно");
    await expect(auth.finishRegistration(second.challengeId, {} as never)).rejects.toThrow("Приглашение недействительно");

    auth.revokePasskey("credential-1");
    expect(auth.authenticate(session.token)).toBeNull();
    expect(fixture.db.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM passkeys").get()?.count).toBe(1);
  });

  test("rejects revoked and expired invitations, including an already-started challenge", async () => {
    const invitation = auth.createInvitation("Second admin");
    const token = new URL(invitation.url).searchParams.get("token")!;
    const start = await auth.registrationOptions({ inviteToken: token });
    auth.revokeInvitation(invitation.id);
    expect(auth.security().invitations).toEqual([]);
    await expect(auth.finishRegistration(start.challengeId, {} as never)).rejects.toThrow("Приглашение недействительно");
    await expect(auth.registrationOptions({ inviteToken: token })).rejects.toThrow("Приглашение недействительно");

    const expiring = auth.createInvitation("Third admin");
    const expiringToken = new URL(expiring.url).searchParams.get("token")!;
    fixture.db.raw.query("UPDATE owner_invitations SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 1).toISOString(), expiring.id);
    await expect(auth.registrationOptions({ inviteToken: expiringToken })).rejects.toThrow("Приглашение недействительно");
  });

  test("cannot finish an owner-session registration after that session is revoked", async () => {
    const token = createToken();
    const timestamp = new Date().toISOString();
    fixture.db.raw.query(`
      INSERT INTO sessions (id, owner_id, token_hash, expires_at, created_at, last_seen_at, passkey_id)
      VALUES ('owner-session', ?, ?, ?, ?, ?, 'original')
    `).run(ownerId, hashToken(token), new Date(Date.now() + 60_000).toISOString(), timestamp, timestamp);
    const start = await auth.registrationOptions({ timezone: "Europe/Moscow" }, ownerId, token);
    fixture.db.raw.query("DELETE FROM sessions WHERE id = 'owner-session'").run();
    await expect(auth.finishRegistration(start.challengeId, {} as never)).rejects.toThrow("Сессия владельца завершена");
  });
});

describe("WebAuthn challenge storage", () => {
  test("stores a claim proof instead of the raw claim token and prunes expired challenges", async () => {
    const fixture = database();
    try {
      const auth = new AuthService(fixture.db);
      const claim = auth.issueClaim();
      fixture.db.raw.query(`
        INSERT INTO webauthn_challenges (id, kind, challenge, context_json, expires_at, created_at)
        VALUES ('expired', 'registration', 'expired', '{}', ?, ?)
      `).run(new Date(Date.now() - 1_000).toISOString(), new Date(Date.now() - 2_000).toISOString());

      const start = await auth.registrationOptions({ timezone: "Europe/Moscow", language: "zh-CN", claimToken: claim.token });

      const rows = fixture.db.raw.query<{ id: string; context_json: string }, []>(
        "SELECT id, context_json FROM webauthn_challenges",
      ).all();
      const grant = fixture.db.setting<{ hash: string; expiresAt: string } | null>("setup_claim", null);
      expect(rows.some((row) => row.id === "expired")).toBeFalse();
      expect(JSON.stringify(rows)).not.toContain(claim.token);
      expect(JSON.stringify(grant)).not.toContain(claim.token);
      expect(grant?.hash).toBe(hashToken(claim.token));
      expect(start.options.user).toMatchObject({ name: "owner", displayName: "所有者" });
      const context = JSON.parse(rows[0]!.context_json);
      expect(context).toMatchObject({ timezone: "Europe/Moscow", language: "zh-CN", authority: "claim" });
      expect(context).not.toHaveProperty("name");
      expect(context.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      fixture.close();
    }
  });

  test("requires a live claim and invalidates an older claim when a new one is issued", async () => {
    const fixture = database();
    try {
      const auth = new AuthService(fixture.db);
      const first = auth.issueClaim();
      const second = auth.issueClaim();
      const context = { timezone: "UTC", language: "en" };

      await expect(auth.registrationOptions(context)).rejects.toThrow("Продолжение первоначальной настройки");
      await expect(auth.registrationOptions({ ...context, claimToken: first.token })).rejects.toThrow("Продолжение первоначальной настройки");
      await expect(auth.registrationOptions({ ...context, claimToken: second.token })).resolves.toHaveProperty("challengeId");

      fixture.db.setSetting("setup_claim", { hash: hashToken(second.token), expiresAt: new Date(Date.now() - 1).toISOString() });
      await expect(auth.registrationOptions({ ...context, claimToken: second.token })).rejects.toThrow("Продолжение первоначальной настройки");
    } finally {
      fixture.close();
    }
  });

  test("checks the claim again at completion and consumes it after creating the owner", async () => {
    const fixture = database();
    try {
      const auth = new AuthService(fixture.db, undefined, acceptedRegistration);
      const staleClaim = auth.issueClaim();
      const staleStart = await auth.registrationOptions({ timezone: "UTC", claimToken: staleClaim.token });
      const activeClaim = auth.issueClaim();

      await expect(auth.finishRegistration(staleStart.challengeId, {} as never)).rejects.toThrow("Продолжение первоначальной настройки");
      expect(fixture.db.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM owners").get()!.count).toBe(0);

      const activeStart = await auth.registrationOptions({ timezone: "UTC", language: "ru", claimToken: activeClaim.token });
      const session = await auth.finishRegistration(activeStart.challengeId, {} as never);
      expect(session.token).toBeTruthy();
      expect(fixture.db.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM owners").get()!.count).toBe(1);
      expect(fixture.db.setting("setup_claim", "missing")).toBeNull();
      await expect(auth.finishRegistration(activeStart.challengeId, {} as never)).rejects.toThrow("WebAuthn challenge недействителен");
    } finally {
      fixture.close();
    }
  });

  test("reissues the first-owner claim through bootstrap reset when the handoff was lost", async () => {
    const fixture = database();
    try {
      const auth = new AuthService(fixture.db);
      const lost = auth.issueClaim();
      const url = new URL(auth.resetBootstrap());
      const replacement = url.searchParams.get("claim")!;
      const grant = fixture.db.setting<{ hash: string; expiresAt: string } | null>("setup_claim", null);

      expect(url.pathname).toBe("/admin/onboarding");
      expect(replacement).toBeTruthy();
      expect(replacement).not.toBe(lost.token);
      expect(grant?.hash).toBe(hashToken(replacement));
      expect(JSON.stringify(grant)).not.toContain(replacement);
      await expect(auth.registrationOptions({ timezone: "UTC", claimToken: lost.token })).rejects.toThrow("Продолжение первоначальной настройки");
      await expect(auth.registrationOptions({ timezone: "UTC", claimToken: replacement })).resolves.toHaveProperty("challengeId");
      expect(fixture.db.setting("owner_recovery", null)).toBeNull();
    } finally {
      fixture.close();
    }
  });

  test("keeps owner recovery separate from first claim and revokes existing sessions", async () => {
    const fixture = database();
    try {
      const auth = new AuthService(fixture.db);
      const ownerId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      fixture.db.raw.query("INSERT INTO owners (id, timezone, language, created_at, updated_at) VALUES (?, 'UTC', 'en', ?, ?)")
        .run(ownerId, timestamp, timestamp);
      fixture.db.raw.query(`
        INSERT INTO sessions (id, owner_id, token_hash, expires_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), ownerId, hashToken(createToken()), new Date(Date.now() + 60_000).toISOString(), timestamp, timestamp);

      const url = new URL(auth.resetBootstrap());
      const recoveryToken = url.searchParams.get("recovery")!;
      const grant = fixture.db.setting<{ hash: string; expiresAt: string } | null>("owner_recovery", null);
      const sessions = fixture.db.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM sessions").get()!.count;

      expect(url.pathname).toBe("/admin/onboarding");
      expect(recoveryToken).toBeTruthy();
      expect(sessions).toBe(0);
      expect(grant?.hash).toBe(hashToken(recoveryToken));
      expect(JSON.stringify(grant)).not.toContain(recoveryToken);
      await expect(auth.registrationOptions({ timezone: "UTC" })).rejects.toThrow("Ссылка восстановления");
      const started = await auth.registrationOptions({ timezone: "UTC", recoveryToken });
      const stored = fixture.db.raw.query<{ context_json: string }, string>(
        "SELECT context_json FROM webauthn_challenges WHERE id = ?",
      ).get(started.challengeId)!;
      expect(JSON.parse(stored.context_json)).toMatchObject({ ownerId, authority: "recovery", tokenHash: grant?.hash });
    } finally {
      fixture.close();
    }
  });
});
