import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";
import { config } from "../config";
import type { OutpostDatabase } from "../db/database";
import { addHours, now } from "../db/database";
import { createToken, hashToken, tokensEqual } from "../security";
import { locales, type Locale } from "../../shared/i18n";
import { ServiceError } from "../services/connections";
import { JournalService, parseUserAgent } from "../services/journal";

const registrationContext = z.object({
  timezone: z.string().trim().min(1).max(80),
  language: z.enum(locales).optional(),
  claimToken: z.string().optional(),
  recoveryToken: z.string().optional(),
});

const registrationChallengeContext = registrationContext.omit({ claimToken: true, recoveryToken: true }).extend({
  language: z.enum(locales),
  ownerId: z.string().uuid(),
  authority: z.enum(["claim", "recovery", "session"]),
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
type RegistrationChallengeContext = z.infer<typeof registrationChallengeContext>;

const challengeLimitPerKind = 100;
const grantKeys = { claim: "setup_claim", recovery: "owner_recovery" } as const;

type GrantKind = keyof typeof grantKeys;
type Grant = { hash: string; expiresAt: string };
type RegistrationVerifier = typeof verifyRegistrationResponse;

type PasskeyRow = {
  id: string;
  owner_id: string;
  public_key: Uint8Array;
  counter: number;
  transports_json: string;
};

export class AuthService {
  private journal: JournalService;

  constructor(
    private db: OutpostDatabase,
    journal: JournalService | undefined = undefined,
    private registrationVerifier: RegistrationVerifier = verifyRegistrationResponse,
  ) {
    this.journal = journal ?? new JournalService(db);
  }

  issueClaim() {
    if (this.owner()) throw new ServiceError(409, "Первоначальная настройка домена уже завершена");
    this.db.setSetting("bootstrap", null);
    return this.issueGrant("claim");
  }

  authorizeClaim(token?: string) {
    if (this.owner()) throw new ServiceError(409, "Владелец уже создан — восстановление доступно только на чистой установке");
    this.verifyGrant("claim", token);
  }

  resetBootstrap() {
    const owner = this.owner();
    if (!owner) {
      const claim = this.issueClaim();
      return `${config.origin}${config.adminPath}/onboarding?claim=${encodeURIComponent(claim.token)}`;
    }
    this.db.raw.query("DELETE FROM sessions WHERE owner_id = ?").run(owner.id);
    const recovery = this.issueGrant("recovery");
    const auditId = this.db.audit({ actor: "root-cli", action: "auth.bootstrap.reset", resource: "owner", resourceId: owner?.id });
    this.journal.record("bootstrap.reset", { actor: "root-cli", auditId, subjectType: "owner", subjectId: owner?.id });
    return `${config.origin}${config.adminPath}/onboarding?recovery=${encodeURIComponent(recovery.token)}`;
  }

  state() {
    const owner = this.owner();
    return {
      initialized: Boolean(owner),
      owner,
      demo: config.demo,
    };
  }

  updateOwner(input: unknown, actor = "owner") {
    const owner = this.owner();
    if (!owner) throw new ServiceError(404, "Владелец ещё не создан");
    const data = z.object({
      timezone: z.string().trim().min(1).max(80).optional(),
      language: z.enum(locales).optional(),
    }).strict().refine((value) => value.timezone !== undefined || value.language !== undefined).parse(input);
    const timestamp = now();
    const updated = { ...owner, ...data };
    this.db.raw.query("UPDATE owners SET timezone = ?, language = ?, updated_at = ? WHERE id = ?")
      .run(updated.timezone, updated.language, timestamp, owner.id);
    this.db.audit({ actor, action: "owner.update", resource: "owner", resourceId: owner.id, before: owner, after: updated });
    return updated;
  }

  async registrationOptions(input: unknown, authenticatedOwnerId?: string) {
    if (config.setup) throw new ServiceError(409, "Сначала подключите постоянный домен");
    const context = registrationContext.parse(input);
    const owner = this.owner();
    let authority: "claim" | "recovery" | "session";
    let grant: Grant | null = null;
    if (!owner) {
      authority = "claim";
      grant = this.verifyGrant("claim", context.claimToken);
    } else if (authenticatedOwnerId === owner.id) {
      authority = "session";
    } else {
      authority = "recovery";
      grant = this.verifyGrant("recovery", context.recoveryToken);
    }
    const ownerId = owner?.id ?? crypto.randomUUID();
    const language = context.language ?? owner?.language ?? "en";
    const passkeys = owner
      ? this.db.raw.query<{ id: string; transports_json: string }, string>("SELECT id, transports_json FROM passkeys WHERE owner_id = ?").all(owner.id)
      : [];
    const options = await generateRegistrationOptions({
      rpName: "Outpost",
      rpID: config.rpID,
      userID: new TextEncoder().encode(ownerId),
      userName: "owner",
      userDisplayName: language === "ru" ? "Владелец" : language === "zh-CN" ? "所有者" : language === "fa" ? "مالک" : "Owner",
      attestationType: "none",
      excludeCredentials: passkeys.map((key) => ({ id: key.id, transports: JSON.parse(key.transports_json) })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    const challengeId = this.storeChallenge("registration", options.challenge, {
      timezone: context.timezone,
      language,
      ownerId,
      authority,
      tokenHash: grant?.hash,
    });
    return { challengeId, options };
  }

  async finishRegistration(challengeId: string, response: RegistrationResponseJSON, userAgent?: string) {
    const challenge = this.challenge(challengeId, "registration");
    const context = registrationChallengeContext.parse(challenge.context);
    this.verifyRegistrationAuthority(context);
    const verification = await this.registrationVerifier({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) throw new ServiceError(400, "Passkey не прошёл проверку");
    const info = verification.registrationInfo;
    const timestamp = now();
    this.db.raw.transaction(() => {
      // Re-check after the asynchronous authenticator verification so two
      // browsers cannot both consume the same first-claim or recovery grant.
      this.verifyRegistrationAuthority(context);
      if (context.authority === "claim") {
        this.db.raw.query("INSERT INTO owners (id, timezone, language, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
          .run(context.ownerId, context.timezone, context.language, timestamp, timestamp);
      }
      this.db.raw.query(`
        INSERT INTO passkeys (id, owner_id, public_key, counter, transports_json, device_type, backed_up, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        info.credential.id,
        context.ownerId,
        info.credential.publicKey,
        info.credential.counter,
        JSON.stringify(info.credential.transports ?? []),
        info.credentialDeviceType,
        info.credentialBackedUp ? 1 : 0,
        timestamp,
      );
      this.consumeChallenge(challengeId);
      if (context.authority === "claim") this.db.setSetting(grantKeys.claim, null);
      if (context.authority === "recovery") this.db.setSetting(grantKeys.recovery, null);
    })();
    const auditId = this.db.audit({ actor: context.ownerId, action: "auth.passkey.register", resource: "passkey", resourceId: info.credential.id });
    this.journal.record("passkey.registered", {
      actor: context.ownerId,
      auditId,
      subjectType: "passkey",
      data: parseUserAgent(userAgent),
    });
    return this.createSession(context.ownerId, userAgent);
  }

  async authenticationOptions() {
    const owner = this.owner();
    if (!owner) throw new ServiceError(409, "Сначала завершите первоначальную настройку");
    const passkeys = this.db.raw.query<PasskeyRow, string>("SELECT * FROM passkeys WHERE owner_id = ?").all(owner.id);
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      allowCredentials: passkeys.map((key) => ({
        id: key.id,
        transports: JSON.parse(key.transports_json) as AuthenticatorTransportFuture[],
      })),
      userVerification: "required",
    });
    const challengeId = this.storeChallenge("authentication", options.challenge, { ownerId: owner.id });
    return { challengeId, options };
  }

  async finishAuthentication(challengeId: string, response: AuthenticationResponseJSON, userAgent?: string) {
    const challenge = this.challenge(challengeId, "authentication");
    const passkey = this.db.raw.query<PasskeyRow, string>("SELECT * FROM passkeys WHERE id = ?").get(response.id);
    if (!passkey) throw new ServiceError(401, "Passkey не зарегистрирован");
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(passkey.public_key),
        counter: passkey.counter,
        transports: JSON.parse(passkey.transports_json),
      },
      requireUserVerification: true,
    });
    if (!verification.verified) throw new ServiceError(401, "Не удалось подтвердить passkey");
    this.db.raw.transaction(() => {
      this.db.raw.query("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?")
        .run(verification.authenticationInfo.newCounter, now(), passkey.id);
      this.consumeChallenge(challengeId);
    })();
    const session = this.createSession(passkey.owner_id, userAgent);
    const auditId = this.db.audit({ actor: passkey.owner_id, action: "auth.login", resource: "session", resourceId: session.id });
    this.journal.record("auth.login_succeeded", {
      actor: passkey.owner_id,
      auditId,
      subjectType: "session",
      data: parseUserAgent(userAgent),
    });
    return session;
  }

  authenticate(sessionToken?: string, authorization?: string) {
    if (config.demo) return this.demoOwner();
    const token = sessionToken || (authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined);
    if (!token) return null;
    if (authorization?.startsWith("Bearer ")) {
      const api = this.db.raw.query<{ id: string; scopes_json: string; expires_at: string | null }, string>(`
        SELECT id, scopes_json, expires_at FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL
      `).get(hashToken(token));
      if (api && (!api.expires_at || api.expires_at > now())) {
        this.db.raw.query("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(now(), api.id);
        return { id: `token:${api.id}`, timezone: "UTC", language: "en" as Locale, scopes: JSON.parse(api.scopes_json) as string[] };
      }
    }
    const row = this.db.raw.query<{ id: string; owner_id: string; expires_at: string }, string>(`
      SELECT id, owner_id, expires_at FROM sessions WHERE token_hash = ?
    `).get(hashToken(token));
    if (!row || row.expires_at <= now()) return null;
    this.db.raw.query("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now(), row.id);
    return this.owner();
  }

  logout(token?: string) {
    if (token) this.db.raw.query("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  security(sessionToken?: string) {
    const owner = this.owner();
    if (!owner) throw new ServiceError(404, "Владелец ещё не создан");
    const currentHash = sessionToken ? hashToken(sessionToken) : null;
    const passkeys = this.db.raw.query<{
      id: string; device_type: string | null; backed_up: number; created_at: string; last_used_at: string | null;
    }, string>(`
      SELECT id, device_type, backed_up, created_at, last_used_at
      FROM passkeys WHERE owner_id = ? ORDER BY created_at DESC
    `).all(owner.id).map((row) => ({
      id: row.id,
      deviceType: row.device_type,
      backedUp: Boolean(row.backed_up),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
    const sessions = this.db.raw.query<{
      id: string; token_hash: string; expires_at: string; created_at: string; last_seen_at: string; user_agent: string | null;
    }, [string, string]>(`
      SELECT id, token_hash, expires_at, created_at, last_seen_at, user_agent
      FROM sessions WHERE owner_id = ? AND expires_at > ? ORDER BY last_seen_at DESC
    `).all(owner.id, now()).map((row) => ({
      id: row.id,
      current: row.token_hash === currentHash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      userAgent: row.user_agent,
    }));
    return { passkeys, sessions, tokens: this.apiTokens() };
  }

  revokePasskey(id: string, actor = "owner") {
    const owner = this.owner();
    if (!owner) throw new ServiceError(404, "Владелец ещё не создан");
    const count = this.db.raw.query<{ count: number }, string>("SELECT COUNT(*) AS count FROM passkeys WHERE owner_id = ?").get(owner.id)?.count ?? 0;
    if (count <= 1) throw new ServiceError(409, "Нельзя удалить единственный passkey владельца");
    const result = this.db.raw.query("DELETE FROM passkeys WHERE id = ? AND owner_id = ?").run(id, owner.id);
    if (!result.changes) throw new ServiceError(404, "Passkey не найден");
    const auditId = this.db.audit({ actor, action: "auth.passkey.revoke", resource: "passkey", resourceId: id });
    this.journal.record("passkey.revoked", { actor, auditId, subjectType: "passkey" });
  }

  endOtherSessions(sessionToken: string | undefined, actor = "owner") {
    const owner = this.owner();
    if (!owner) throw new ServiceError(404, "Владелец ещё не создан");
    if (!sessionToken) throw new ServiceError(400, "Текущая сессия не найдена");
    const result = this.db.raw.query("DELETE FROM sessions WHERE owner_id = ? AND token_hash != ?")
      .run(owner.id, hashToken(sessionToken));
    const auditId = this.db.audit({ actor, action: "auth.sessions.revoke_others", resource: "session", after: { revoked: result.changes } });
    this.journal.record("sessions.revoked_others", { actor, auditId, subjectType: "session", data: { revoked: result.changes } });
    return { revoked: result.changes };
  }

  revokeSession(id: string, sessionToken: string | undefined, actor = "owner") {
    const owner = this.owner();
    if (!owner) throw new ServiceError(404, "Владелец ещё не создан");
    if (!sessionToken) throw new ServiceError(400, "Текущая сессия не найдена");
    const currentHash = hashToken(sessionToken);
    const session = this.db.raw.query<{ token_hash: string }, [string, string]>(
      "SELECT token_hash FROM sessions WHERE id = ? AND owner_id = ?",
    ).get(id, owner.id);
    if (!session) throw new ServiceError(404, "Сессия не найдена");
    if (session.token_hash === currentHash) throw new ServiceError(409, "Текущую сессию нужно завершать выходом из панели");
    this.db.raw.query("DELETE FROM sessions WHERE id = ? AND owner_id = ?").run(id, owner.id);
    const auditId = this.db.audit({ actor, action: "auth.session.revoke", resource: "session", resourceId: id });
    this.journal.record("session.revoked", { actor, auditId, subjectType: "session" });
  }

  createApiToken(name: string, scopes: string[], actor = "owner") {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) throw new ServiceError(400, "Укажите имя токена до 80 символов");
    const allowed = new Set([
      "status:read", "traffic:read", "connections:read", "connections:write", "connections:secret", "connections:rotate", "routes:read", "routes:write",
      "operations:read", "operations:write", "settings:read", "settings:write", "engines:read", "engines:write",
      "system:read", "backups:read",
    ]);
    const uniqueScopes = Array.from(new Set(scopes));
    if (!uniqueScopes.length || uniqueScopes.some((scope) => !allowed.has(scope))) throw new ServiceError(400, "Запрошен недопустимый scope");
    const token = createToken();
    const id = crypto.randomUUID();
    this.db.raw.query(`
      INSERT INTO api_tokens (id, name, token_hash, scopes_json, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(id, cleanName, hashToken(token), JSON.stringify(uniqueScopes), now());
    const auditId = this.db.audit({ actor, action: "tokens.create", resource: "api_token", resourceId: id, after: { name: cleanName, scopes: uniqueScopes } });
    this.journal.record("token.created", { actor, auditId, subjectType: "api_token", subjectId: id, data: { name: cleanName, scopes: uniqueScopes } });
    return { id, name: cleanName, scopes: uniqueScopes, token };
  }

  apiTokens() {
    return this.db.raw.query<{
      id: string; name: string; scopes_json: string; expires_at: string | null; created_at: string; last_used_at: string | null;
    }, []>(`
      SELECT id, name, scopes_json, expires_at, created_at, last_used_at
      FROM api_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC
    `).all().map((row) => ({ ...row, scopes: JSON.parse(row.scopes_json), scopes_json: undefined }));
  }

  revokeApiToken(id: string, actor = "owner") {
    const token = this.db.raw.query<{ name: string }, string>("SELECT name FROM api_tokens WHERE id = ? AND revoked_at IS NULL").get(id);
    const result = this.db.raw.query("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now(), id);
    if (!result.changes) throw new ServiceError(404, "API-токен не найден");
    const auditId = this.db.audit({ actor, action: "tokens.revoke", resource: "api_token", resourceId: id });
    this.journal.record("token.revoked", { actor, auditId, subjectType: "api_token", subjectId: id, data: { name: token?.name ?? "API" } });
  }

  private createSession(ownerId: string, userAgent?: string) {
    const token = createToken();
    const session = { id: crypto.randomUUID(), token, expiresAt: addHours(config.sessionHours) };
    this.db.raw.query(`
      INSERT INTO sessions (id, owner_id, token_hash, expires_at, created_at, last_seen_at, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(session.id, ownerId, hashToken(token), session.expiresAt, now(), now(), userAgent ?? null);
    return session;
  }

  private owner() {
    return this.db.raw.query<{ id: string; timezone: string; language: Locale }, []>("SELECT id, timezone, language FROM owners LIMIT 1").get() ?? null;
  }

  private demoOwner() {
    let owner = this.owner();
    if (owner) return owner;
    const timestamp = now();
    owner = { id: crypto.randomUUID(), timezone: "UTC", language: "en" };
    this.db.raw.query("INSERT INTO owners (id, timezone, language, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(owner.id, owner.timezone, owner.language, timestamp, timestamp);
    return owner;
  }

  private issueGrant(kind: GrantKind) {
    const token = createToken();
    const grant = { hash: hashToken(token), expiresAt: addHours(1) };
    this.db.setSetting(grantKeys[kind], grant);
    return { token, expiresAt: grant.expiresAt };
  }

  private verifyGrant(kind: GrantKind, token?: string) {
    const grant = this.db.setting<Grant | null>(grantKeys[kind], null);
    if (!token || !grant || grant.expiresAt <= now() || !tokensEqual(token, grant.hash)) {
      throw new ServiceError(401, kind === "claim"
        ? "Продолжение первоначальной настройки недействительно или истекло"
        : "Ссылка восстановления недействительна или истекла");
    }
    return grant;
  }

  private verifyGrantHash(kind: GrantKind, hash?: string) {
    const grant = this.db.setting<Grant | null>(grantKeys[kind], null);
    if (!hash || !grant || grant.expiresAt <= now() || grant.hash !== hash) {
      throw new ServiceError(401, kind === "claim"
        ? "Продолжение первоначальной настройки недействительно или истекло"
        : "Ссылка восстановления недействительна или истекла");
    }
  }

  private verifyRegistrationAuthority(context: RegistrationChallengeContext) {
    const owner = this.owner();
    if (context.authority === "claim") {
      if (owner) throw new ServiceError(409, "Первоначальная настройка домена уже завершена");
      this.verifyGrantHash("claim", context.tokenHash);
      return;
    }
    if (!owner || owner.id !== context.ownerId) throw new ServiceError(401, "Нужна действующая сессия владельца");
    if (context.authority === "recovery") this.verifyGrantHash("recovery", context.tokenHash);
  }

  private storeChallenge(kind: string, challenge: string, context: unknown) {
    this.pruneChallenges();
    const count = this.db.raw.query<{ count: number }, string>(
      "SELECT COUNT(*) AS count FROM webauthn_challenges WHERE kind = ?",
    ).get(kind)?.count ?? 0;
    if (count >= challengeLimitPerKind) {
      throw new ServiceError(429, "Слишком много незавершённых WebAuthn-запросов — попробуйте позже");
    }
    const id = crypto.randomUUID();
    this.db.raw.query(`
      INSERT INTO webauthn_challenges (id, kind, challenge, context_json, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, kind, challenge, JSON.stringify(context), addHours(0.17), now());
    return id;
  }

  private challenge(id: string, kind: string) {
    this.pruneChallenges();
    const row = this.db.raw.query<{ kind: string; challenge: string; context_json: string; expires_at: string }, string>(
      "SELECT kind, challenge, context_json, expires_at FROM webauthn_challenges WHERE id = ?",
    ).get(id);
    if (!row || row.kind !== kind || row.expires_at <= now()) throw new ServiceError(400, "WebAuthn challenge недействителен или истёк");
    return { challenge: row.challenge, context: JSON.parse(row.context_json) as unknown };
  }

  private consumeChallenge(id: string) {
    this.db.raw.query("DELETE FROM webauthn_challenges WHERE id = ?").run(id);
  }

  private pruneChallenges() {
    this.db.raw.query("DELETE FROM webauthn_challenges WHERE expires_at <= ?").run(now());
  }
}
