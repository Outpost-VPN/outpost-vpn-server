import { z } from "zod";
import { config } from "../config";
import type { OutpostDatabase } from "../db/database";
import { now } from "../db/database";
import type {
  Connection,
  ConnectionCredential,
  ConnectionPresence,
  EngineId,
  EnginePresence,
  PresenceStatus,
} from "../models";
import { createToken, decryptSecret, deriveToken, encryptSecret, hashToken, type SecretBox } from "../security";
import { JournalService } from "./journal";

const createInput = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.enum(["blue", "green", "peach", "violet", "slate"]).default("blue"),
  avatar: z.string().regex(/^avatar-(?:person|group|current|\d{1,3})$/).default("avatar-person"),
}).strict();

const updateInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.enum(["blue", "green", "peach", "violet", "slate"]).optional(),
  avatar: z.string().regex(/^avatar-(?:person|group|current|\d{1,3})$/).optional(),
}).strict();

type CredentialRow = SecretBox & { engine: EngineId };

export class ConnectionService {
  private journal: JournalService;

  constructor(private db: OutpostDatabase, journal?: JournalService) {
    this.journal = journal ?? new JournalService(db);
  }

  list(includeArchived = false) {
    const filter = includeArchived ? "1 = 1" : "archived_at IS NULL";
    return this.db.raw.query<Connection, []>(`
      SELECT ${connectionColumns()} FROM connections
      WHERE ${filter} ORDER BY created_at, serial
    `).all().map((connection) => this.withPresence(connection));
  }

  get(id: string, includeArchived = false) {
    const connection = this.db.raw.query<Connection, string>(`
      SELECT ${connectionColumns()} FROM connections
      WHERE id = ? ${includeArchived ? "" : "AND archived_at IS NULL"}
    `).get(id);
    if (!connection) throw new ServiceError(404, "Подключение не найдено");
    return this.withPresence(connection);
  }

  create(input: unknown, actor = "owner") {
    const data = createInput.parse(input);
    const timestamp = now();
    const serial = (this.db.raw.query<{ serial: number }, []>(
      "SELECT COALESCE(MAX(serial), 0) + 1 AS serial FROM connections",
    ).get()?.serial ?? 1);
    const connection: Connection = {
      id: crypto.randomUUID(),
      serial,
      name: data.name,
      color: data.color,
      avatar: data.avatar,
      status: "provisioning",
      generation: 1,
      created_at: timestamp,
      updated_at: timestamp,
      activated_at: null,
      first_used_at: null,
      last_fetched_at: null,
      first_seen_at: null,
      last_seen_at: null,
      absence_notified_at: null,
      suspended_at: null,
      archived_at: null,
    };
    const token = this.token(connection.id, connection.generation);
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        INSERT INTO connections (
          id, serial, name, color, avatar, status, generation,
          subscription_token_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'provisioning', ?, ?, ?, ?)
      `).run(
        connection.id, connection.serial, connection.name, connection.color,
        connection.avatar, connection.generation, hashToken(token), timestamp, timestamp,
      );
      this.issue(connection.id, connection.generation, "pending");
      this.createJob(connection.id, connection.generation, null, "activate", actor);
    })();
    const auditId = this.db.audit({ actor, action: "connections.create", resource: "connection", resourceId: connection.id, after: connection });
    this.journal.record("connection.created", {
      actor,
      auditId,
      subjectType: "connection",
      subjectId: connection.id,
      data: { connectionName: connection.name },
    });
    return this.get(connection.id);
  }

  update(id: string, input: unknown, actor = "owner") {
    const before = this.get(id);
    const data = updateInput.parse(input);
    const next = {
      name: data.name ?? before.name,
      color: data.color ?? before.color,
      avatar: data.avatar ?? before.avatar,
    };
    const timestamp = now();
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        UPDATE connections SET name = ?, color = ?, avatar = ?, updated_at = ? WHERE id = ?
      `).run(next.name, next.color, next.avatar, timestamp, id);
      const auditId = this.db.audit({ actor, action: "connections.update", resource: "connection", resourceId: id, before, after: next });
      this.journal.record("connection.updated", {
        actor,
        auditId,
        subjectType: "connection",
        subjectId: id,
        data: { connectionName: next.name },
      });
    })();
    return this.get(id);
  }

  prepareRotation(id: string, actor = "owner") {
    const connection = this.get(id);
    if (connection.status !== "active" || connection.suspended_at) {
      throw new ServiceError(409, "Подключение пока нельзя перевыпустить");
    }
    const generation = connection.generation + 1;
    const timestamp = now();
    const token = this.token(id, generation);
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        UPDATE connections SET
          status = 'rotating', generation = ?, subscription_token_hash = ?,
          activated_at = NULL, first_used_at = NULL, last_fetched_at = NULL, updated_at = ?
        WHERE id = ?
      `).run(generation, hashToken(token), timestamp, id);
      this.issue(id, generation, "pending");
      this.createJob(id, generation, connection.generation, "rotate", actor);
    })();
    return this.get(id);
  }

  prepareSuspend(id: string, actor = "owner") {
    const connection = this.get(id);
    if (connection.status !== "active") throw new ServiceError(409, "Подключение пока нельзя приостановить");
    const timestamp = now();
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        UPDATE connection_sync_jobs SET status = 'cancelled', completed_at = ?, updated_at = ?
        WHERE connection_id = ? AND status IN ('pending', 'running', 'failed')
      `).run(timestamp, timestamp, id);
      this.db.raw.query("UPDATE connections SET suspended_at = COALESCE(suspended_at, ?), updated_at = ? WHERE id = ?")
        .run(timestamp, timestamp, id);
      this.db.raw.query("DELETE FROM connection_presence WHERE connection_id = ?").run(id);
      this.createJob(id, connection.generation, null, "suspend", actor);
    })();
    return this.get(id);
  }

  prepareResume(id: string, actor = "owner") {
    const connection = this.get(id);
    if (connection.status !== "active") throw new ServiceError(409, "Подключение пока нельзя возобновить");
    if (!connection.suspended_at) return connection;
    const timestamp = now();
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        UPDATE connection_sync_jobs SET status = 'cancelled', completed_at = ?, updated_at = ?
        WHERE connection_id = ? AND status IN ('pending', 'running', 'failed')
      `).run(timestamp, timestamp, id);
      this.createJob(id, connection.generation, null, "resume", actor);
    })();
    return this.get(id);
  }

  completeSuspend(id: string, actor: string) {
    const connection = this.get(id);
    const auditId = this.db.audit({ actor, action: "connections.suspend", resource: "connection", resourceId: id, after: { suspended_at: connection.suspended_at } });
    this.journal.record("connection.suspended", {
      actor,
      auditId,
      subjectType: "connection",
      subjectId: id,
      data: { connectionName: connection.name },
    });
  }

  completeResume(id: string, actor: string) {
    const connection = this.get(id);
    const timestamp = now();
    this.db.raw.query("UPDATE connections SET suspended_at = NULL, updated_at = ? WHERE id = ?")
      .run(timestamp, id);
    const auditId = this.db.audit({ actor, action: "connections.resume", resource: "connection", resourceId: id, before: connection, after: { suspended_at: null } });
    this.journal.record("connection.resumed", {
      actor,
      auditId,
      subjectType: "connection",
      subjectId: id,
      data: { connectionName: connection.name },
    });
    return this.get(id);
  }

  prepareArchive(id: string, actor = "owner") {
    const connection = this.get(id);
    const timestamp = now();
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        UPDATE connection_sync_jobs SET status = 'cancelled', completed_at = ?, updated_at = ?
        WHERE connection_id = ? AND status IN ('pending', 'running', 'failed')
      `).run(timestamp, timestamp, id);
      this.db.raw.query(`
        UPDATE connections SET status = 'archiving', subscription_token_hash = NULL,
          archived_at = ?, updated_at = ? WHERE id = ?
      `).run(timestamp, timestamp, id);
      this.createJob(id, connection.generation, null, "revoke", actor);
    })();
    const auditId = this.db.audit({ actor, action: "connections.archive", resource: "connection", resourceId: id, before: connection });
    this.journal.record("connection.archived", {
      actor,
      auditId,
      subjectType: "connection",
      subjectId: id,
      data: { connectionName: connection.name },
    });
    return this.get(id, true);
  }

  completeActivation(id: string, generation: number, actor: string) {
    const connection = this.get(id, true);
    const timestamp = now();
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        UPDATE credentials SET state = 'revoked', revoked_at = ?
        WHERE connection_id = ? AND generation != ? AND state = 'active'
      `).run(timestamp, id, generation);
      this.db.raw.query(`
        UPDATE credentials SET state = 'active', activated_at = ?, revoked_at = NULL
        WHERE connection_id = ? AND generation = ? AND state = 'pending'
      `).run(timestamp, id, generation);
      this.db.raw.query(`
        UPDATE connections SET status = 'active', activated_at = ?, updated_at = ? WHERE id = ?
      `).run(timestamp, timestamp, id);
    })();
    const type = connection.status === "rotating" ? "connection.rotated" : "connection.activated";
    const action = connection.status === "rotating" ? "connections.rotate" : "connections.activate";
    const auditId = this.db.audit({ actor, action, resource: "connection", resourceId: id, after: { generation } });
    this.journal.record(type, {
      actor,
      auditId,
      subjectType: "connection",
      subjectId: id,
      data: { connectionName: connection.name, generation },
    });
  }

  completeArchive(id: string, actor: string) {
    const connection = this.get(id, true);
    const timestamp = now();
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        UPDATE credentials SET state = 'revoked', revoked_at = COALESCE(revoked_at, ?)
        WHERE connection_id = ? AND state != 'revoked'
      `).run(timestamp, id);
      this.db.raw.query("UPDATE connections SET status = 'archived', updated_at = ? WHERE id = ?").run(timestamp, id);
    })();
    this.db.audit({ actor, action: "connections.revoke", resource: "connection", resourceId: id, before: connection });
  }

  bySubscriptionToken(token: string) {
    const connection = this.db.raw.query<Connection, string>(`
      SELECT ${connectionColumns()} FROM connections
      WHERE subscription_token_hash = ? AND status = 'active'
        AND suspended_at IS NULL AND archived_at IS NULL
    `).get(hashToken(token));
    if (!connection) throw new ServiceError(404, "Ссылка не найдена или отозвана");
    return this.withPresence(connection);
  }

  markFetched(connectionId: string) {
    const connection = this.get(connectionId);
    const timestamp = now();
    const first = !connection.first_used_at;
    this.db.raw.query(`
      UPDATE connections SET first_used_at = COALESCE(first_used_at, ?),
        last_fetched_at = ?, updated_at = ? WHERE id = ?
    `).run(timestamp, timestamp, timestamp, connectionId);
    if (first) {
      this.journal.record("connection.first_used", {
        actor: "connection",
        subjectType: "connection",
        subjectId: connectionId,
        data: { connectionName: connection.name },
      });
    }
  }

  credentials(connectionId: string, generation?: number): ConnectionCredential {
    const connection = this.get(connectionId, true);
    const selected = generation ?? connection.generation;
    const rows = this.db.raw.query<CredentialRow, [string, number]>(`
      SELECT engine, ciphertext, iv, tag FROM credentials
      WHERE connection_id = ? AND generation = ? AND state != 'revoked'
    `).all(connectionId, selected);
    const hysteria = rows.find((row) => row.engine === "hysteria");
    const xray = rows.find((row) => row.engine === "xray");
    if (!hysteria || !xray) throw new ServiceError(409, "Credentials подключения недоступны");
    return { connectionId, generation: selected, hysteria: decryptSecret(hysteria), xray: decryptSecret(xray) };
  }

  activeCredentials() {
    return this.list()
      .filter((connection) => connection.status === "active" && !connection.suspended_at)
      .map((connection) => this.credentials(connection.id));
  }

  authenticateHysteria(auth: string) {
    const rows = this.db.raw.query<CredentialRow & { connection_id: string }, []>(`
      SELECT credentials.connection_id, credentials.engine, credentials.ciphertext, credentials.iv, credentials.tag
      FROM credentials JOIN connections ON connections.id = credentials.connection_id
      WHERE credentials.engine = 'hysteria' AND credentials.state = 'active'
        AND connections.status = 'active' AND connections.suspended_at IS NULL
        AND connections.archived_at IS NULL
    `).all();
    for (const row of rows) {
      const credential = decryptSecret<{ id: string; password: string }>(row);
      if (credential.password === auth) return { ok: true, id: row.connection_id };
    }
    return { ok: false };
  }

  subscription(connectionId: string) {
    const connection = this.get(connectionId);
    if (connection.status !== "active") return null;
    const token = this.token(connection.id, connection.generation);
    this.db.raw.query("UPDATE connections SET subscription_token_hash = ? WHERE id = ?")
      .run(hashToken(token), connectionId);
    return { url: `${config.origin}/s/${token}` };
  }

  private issue(connectionId: string, generation: number, state: "pending" | "active") {
    const credential: ConnectionCredential = {
      connectionId,
      generation,
      hysteria: { id: connectionId, password: createToken(24) },
      xray: { id: crypto.randomUUID(), email: `${connectionId}.${generation}@outpost.local` },
    };
    this.store(connectionId, generation, "hysteria", state, credential.hysteria);
    this.store(connectionId, generation, "xray", state, credential.xray);
  }

  private store(connectionId: string, generation: number, engine: EngineId, state: string, value: unknown) {
    const box = encryptSecret(value);
    this.db.raw.query(`
      INSERT INTO credentials (
        id, connection_id, generation, engine, state, ciphertext, iv, tag, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), connectionId, generation, engine, state, box.ciphertext, box.iv, box.tag, now());
  }

  private createJob(
    connectionId: string,
    generation: number,
    previous: number | null,
    kind: "activate" | "rotate" | "revoke" | "suspend" | "resume",
    actor: string,
  ) {
    const timestamp = now();
    this.db.raw.query(`
      INSERT INTO connection_sync_jobs (
        id, connection_id, generation, previous_generation, kind, status,
        actor, attempts, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?)
    `).run(crypto.randomUUID(), connectionId, generation, previous, kind, actor, timestamp, timestamp, timestamp);
  }

  private token(id: string, generation: number) {
    return deriveToken("connection-subscription", `${id}:${generation}`);
  }

  private withPresence(connection: Connection): Connection {
    const rows = this.db.raw.query<PresenceRow, string>(`
      SELECT engine, status, signal, connections, last_active_at, observed_at, changed_at
      FROM connection_presence WHERE connection_id = ? ORDER BY engine
    `).all(connection.id);
    const engines: Partial<Record<EngineId, EnginePresence>> = {};
    for (const row of rows) {
      engines[row.engine] = {
        status: row.status,
        signal: row.signal,
        connections: row.connections,
        last_active_at: row.last_active_at,
        observed_at: row.observed_at,
        changed_at: row.changed_at,
      };
    }
    const statuses = rows.map((row) => row.status);
    const status: PresenceStatus = connection.suspended_at
      ? "offline"
      : statuses.includes("online")
      ? "online"
      : statuses.includes("unknown") || statuses.length === 0
        ? "unknown"
        : "offline";
    const presence: ConnectionPresence = {
      status,
      first_seen_at: connection.first_seen_at,
      last_seen_at: connection.last_seen_at,
      changed_at: rows.map((row) => row.changed_at).sort().at(-1) ?? null,
      engines,
    };
    return { ...connection, presence };
  }
}

type PresenceRow = {
  engine: EngineId;
  status: PresenceStatus;
  signal: "connections" | "traffic";
  connections: number | null;
  last_active_at: string | null;
  observed_at: string;
  changed_at: string;
};

function connectionColumns() {
  return [
    "id", "serial", "name", "color", "avatar", "status", "generation",
    "created_at", "updated_at", "activated_at", "first_used_at", "last_fetched_at",
    "first_seen_at", "last_seen_at", "absence_notified_at", "suspended_at", "archived_at",
  ].join(", ");
}

export class ServiceError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
