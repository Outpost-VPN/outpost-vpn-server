import { z } from "zod";
import type { MatreshkaDatabase } from "../db/database";
import { addHours, now } from "../db/database";
import type { ClientKind, Device, DeviceCredential, DevicePresence, EngineId, EnginePresence, Person, PresenceStatus } from "../models";
import { createToken, decryptSecret, deriveToken, encryptSecret, hashToken, tokensEqual, type SecretBox } from "../security";
import { config } from "../config";
import { JournalService } from "./journal";

const personInput = z.object({
  name: z.string().trim().min(1).max(80),
  note: z.string().trim().max(500).default(""),
  color: z.enum(["blue", "green", "peach", "violet", "slate"]).default("blue"),
  avatar: z.string().regex(/^avatar-(?:current|\d{1,3})$/).default("avatar-current"),
});

const deviceInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["phone", "tablet", "computer", "vr", "television", "other"]).default("other"),
  platform: z.enum(["ios", "macos", "android", "windows", "linux", "unknown"]).default("unknown"),
  client: z.enum(["incy", "mihomo"]).default("incy"),
});

const deviceUpdateInput = deviceInput.pick({ name: true, kind: true, platform: true }).partial();

type CredentialRow = SecretBox & { engine: string };

export class PeopleService {
  private journal: JournalService;

  constructor(private db: MatreshkaDatabase, journal?: JournalService) {
    this.journal = journal ?? new JournalService(db);
  }

  list() {
    const people = this.db.raw.query<Person, []>("SELECT * FROM people WHERE archived_at IS NULL ORDER BY created_at").all();
    const devices = this.db.raw.query<Device, []>(`
      SELECT ${deviceColumns("devices")}, people.name AS person_name
      FROM devices JOIN people ON people.id = devices.person_id
      ORDER BY devices.created_at
    `).all().map((device) => this.withPresence(device));
    return people.map((person) => ({ ...person, devices: devices.filter((device) => device.person_id === person.id) }));
  }

  get(id: string) {
    const person = this.db.raw.query<Person, string>("SELECT * FROM people WHERE id = ? AND archived_at IS NULL").get(id);
    if (!person) throw new ServiceError(404, "Человек не найден");
    const devices = this.db.raw.query<Device, string>(
      `SELECT ${deviceColumns("devices")}
       FROM devices WHERE person_id = ? ORDER BY created_at`,
    ).all(id).map((device) => this.withPresence(device));
    return { ...person, devices };
  }

  create(input: unknown, actor = "owner") {
    const data = personInput.parse(input);
    const timestamp = now();
    const person: Person = {
      id: crypto.randomUUID(),
      ...data,
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    };
    return this.journal.change(
      "person.created",
      () => {
        this.db.raw.query(`
          INSERT INTO people (id, name, note, color, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(person.id, person.name, person.note, person.color, person.avatar, timestamp, timestamp);
        return person;
      },
      () => ({ actor, action: "people.create", resource: "person", resourceId: person.id, after: person }),
      () => ({ actor, subjectType: "person", subjectId: person.id, data: { personName: person.name } }),
    );
  }

  update(id: string, input: unknown, actor = "owner") {
    const before = this.get(id);
    const data = personInput.partial().parse(input);
    const next = {
      name: data.name ?? before.name,
      note: data.note ?? before.note,
      color: data.color ?? before.color,
      avatar: data.avatar ?? before.avatar,
      updated_at: now(),
    };
    this.db.raw.transaction(() => {
      this.db.raw.query("UPDATE people SET name = ?, note = ?, color = ?, avatar = ?, updated_at = ? WHERE id = ?")
        .run(next.name, next.note, next.color, next.avatar, next.updated_at, id);
      const auditId = this.db.audit({ actor, action: "people.update", resource: "person", resourceId: id, before, after: next });
      this.journal.record("person.updated", { actor, auditId, subjectType: "person", subjectId: id, data: { personName: next.name } });
    })();
    return this.get(id);
  }

  archive(id: string, actor = "owner") {
    const before = this.get(id);
    const active = before.devices.some((device) => device.status !== "revoked");
    if (active) throw new ServiceError(409, "Сначала отзовите все устройства человека");
    this.db.raw.transaction(() => {
      this.db.raw.query("UPDATE people SET archived_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), id);
      const auditId = this.db.audit({ actor, action: "people.archive", resource: "person", resourceId: id, before });
      this.journal.record("person.archived", { actor, auditId, subjectType: "person", subjectId: id, data: { personName: before.name } });
    })();
  }

  createDevice(personId: string, input: unknown, actor = "owner") {
    this.get(personId);
    const data = deviceInput.parse(input);
    const timestamp = now();
    const device: Device = {
      id: crypto.randomUUID(),
      person_id: personId,
      ...data,
      status: "invited",
      created_at: timestamp,
      updated_at: timestamp,
      activated_at: null,
      first_seen_at: null,
      last_seen_at: null,
      profile_fetched_at: null,
      last_routes_version: null,
      absence_notified_at: null,
      revoked_at: null,
    };
    const credential: DeviceCredential = {
      deviceId: device.id,
      hysteria: { id: device.id, password: createToken(24) },
      xray: { id: crypto.randomUUID(), email: `${device.id}@matreshka.local` },
    };
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        INSERT INTO devices (id, person_id, name, kind, platform, client, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(device.id, personId, device.name, device.kind, device.platform, device.client, device.status, timestamp, timestamp);
      this.storeCredential(device.id, "hysteria", credential.hysteria);
      this.storeCredential(device.id, "xray", credential.xray);
    })();
    const invitation = this.createInvitation(device.id);
    const person = this.get(personId);
    const auditId = this.db.audit({ actor, action: "devices.create", resource: "device", resourceId: device.id, after: device });
    this.journal.record("device.created", {
      actor,
      auditId,
      subjectType: "device",
      subjectId: device.id,
      data: { deviceName: device.name, personName: person.name, kind: device.kind, platform: device.platform },
    });
    return { device, invitation };
  }

  updateDevice(id: string, input: unknown, actor = "owner") {
    const before = this.device(id);
    const data = deviceUpdateInput.parse(input);
    const next = {
      name: data.name ?? before.name,
      kind: data.kind ?? before.kind,
      platform: data.platform ?? before.platform,
      updated_at: now(),
    };
    this.db.raw.transaction(() => {
      this.db.raw.query("UPDATE devices SET name = ?, kind = ?, platform = ?, updated_at = ? WHERE id = ?")
        .run(next.name, next.kind, next.platform, next.updated_at, id);
      const auditId = this.db.audit({ actor, action: "devices.update", resource: "device", resourceId: id, before, after: next });
      this.journal.record("device.updated", {
        actor,
        auditId,
        subjectType: "device",
        subjectId: id,
        data: { deviceName: next.name, personName: before.person_name, kind: next.kind, platform: next.platform },
      });
    })();
    return this.device(id);
  }

  createInvitation(deviceId: string) {
    const device = this.device(deviceId);
    if (device.status === "revoked") throw new ServiceError(409, "Устройство отозвано");
    const token = createToken();
    const invitation = {
      id: crypto.randomUUID(),
      token,
      expiresAt: addHours(config.invitationHours),
    };
    this.db.raw.query("UPDATE invitations SET status = 'superseded' WHERE device_id = ? AND status = 'pending'").run(deviceId);
    this.db.raw.query(`
      INSERT INTO invitations (id, device_id, token_hash, status, expires_at, created_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(invitation.id, deviceId, hashToken(token), invitation.expiresAt, now());
    return {
      id: invitation.id,
      expires_at: invitation.expiresAt,
      url: `${config.origin}/invite/${token}`,
    };
  }

  invitation(token: string) {
    const hash = hashToken(token);
    const row = this.db.raw.query<{
      id: string; device_id: string; status: string; expires_at: string; device_name: string;
      client: ClientKind; person_name: string;
    }, string>(`
      SELECT invitations.id, invitations.device_id, invitations.status, invitations.expires_at,
        devices.name AS device_name, devices.client, people.name AS person_name
      FROM invitations
      JOIN devices ON devices.id = invitations.device_id
      JOIN people ON people.id = devices.person_id
      WHERE invitations.token_hash = ?
    `).get(hash);
    if (!row || !tokensEqual(token, hash)) throw new ServiceError(404, "Приглашение не найдено");
    if (row.status !== "pending") throw new ServiceError(410, "Приглашение уже использовано или заменено");
    if (row.expires_at <= now()) throw new ServiceError(410, "Срок приглашения истёк");
    return row;
  }

  redemption(token: string) {
    const row = this.db.raw.query<{ device_id: string; expires_at: string }, string>(
      "SELECT device_id, expires_at FROM redemption_sessions WHERE token_hash = ?",
    ).get(hashToken(token));
    if (!row || row.expires_at <= now()) throw new ServiceError(404, "Сессия установки не найдена");
    const device = this.device(row.device_id);
    if (device.status !== "active") throw new ServiceError(409, "Подключение устройства ещё не завершено");
    const subscriptionToken = deriveToken("device-subscription", row.device_id);
    return {
      device,
      subscriptionUrl: this.subscriptionUrl(device.client, subscriptionToken),
      expiresAt: row.expires_at,
    };
  }

  device(id: string) {
    const device = this.db.raw.query<Device, string>(`
      SELECT ${deviceColumns("devices")}, people.name AS person_name FROM devices
      JOIN people ON people.id = devices.person_id WHERE devices.id = ?
    `).get(id);
    if (!device) throw new ServiceError(404, "Устройство не найдено");
    return this.withPresence(device);
  }

  bySubscriptionToken(token: string) {
    const device = this.db.raw.query<Device, string>(`
      SELECT ${deviceColumns("devices")}, people.name AS person_name FROM devices
      JOIN people ON people.id = devices.person_id
      WHERE devices.subscription_token_hash = ? AND devices.status = 'active'
    `).get(hashToken(token));
    if (!device) throw new ServiceError(404, "Подписка не найдена или отозвана");
    return this.withPresence(device);
  }

  markProfileFetched(deviceId: string) {
    const device = this.device(deviceId);
    const first = !device.profile_fetched_at;
    this.db.raw.query("UPDATE devices SET profile_fetched_at = ? WHERE id = ?").run(now(), deviceId);
    if (first) {
      this.journal.record("device.profile_fetched", {
        actor: "device",
        subjectType: "device",
        subjectId: deviceId,
        data: { deviceName: device.name, personName: device.person_name, client: device.client },
      });
    }
  }

  markRoutesFetched(deviceId: string, version: number) {
    this.db.raw.query("UPDATE devices SET last_routes_version = ? WHERE id = ?").run(version, deviceId);
  }

  credentials(deviceId: string): DeviceCredential {
    const rows = this.db.raw.query<CredentialRow, string>(`
      SELECT engine, ciphertext, iv, tag FROM credentials WHERE device_id = ? AND revoked_at IS NULL
    `).all(deviceId);
    const hysteria = rows.find((row) => row.engine === "hysteria");
    const xray = rows.find((row) => row.engine === "xray");
    if (!hysteria || !xray) throw new ServiceError(409, "Credentials устройства недоступны");
    return {
      deviceId,
      hysteria: decryptSecret(hysteria),
      xray: decryptSecret(xray),
    };
  }

  authenticateHysteria(auth: string) {
    const rows = this.db.raw.query<CredentialRow & { device_id: string }, []>(`
      SELECT credentials.device_id, credentials.engine, credentials.ciphertext, credentials.iv, credentials.tag
      FROM credentials JOIN devices ON devices.id = credentials.device_id
      WHERE credentials.engine = 'hysteria' AND credentials.revoked_at IS NULL AND devices.status = 'active'
    `).all();
    for (const row of rows) {
      const credential = decryptSecret<{ id: string; password: string }>(row);
      if (credential.password === auth) return { ok: true, id: row.device_id };
    }
    return { ok: false };
  }

  private storeCredential(deviceId: string, engine: string, value: unknown) {
    const box = encryptSecret(value);
    this.db.raw.query(`
      INSERT INTO credentials (id, device_id, engine, ciphertext, iv, tag, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), deviceId, engine, box.ciphertext, box.iv, box.tag, now());
  }

  private subscriptionUrl(client: ClientKind, token: string) {
    return `${config.origin}/subscriptions/${client}/${token}`;
  }

  private withPresence(device: Device): Device {
    const rows = this.db.raw.query<PresenceRow, string>(`
      SELECT engine, status, signal, connections, last_active_at, observed_at, changed_at
      FROM device_presence WHERE device_id = ? ORDER BY engine
    `).all(device.id);
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
    const status: PresenceStatus = statuses.includes("online")
      ? "online"
      : statuses.includes("unknown") || statuses.length === 0
        ? "unknown"
        : "offline";
    const changedAt = rows.map((row) => row.changed_at).sort().at(-1) ?? null;
    const presence: DevicePresence = {
      status,
      first_seen_at: device.first_seen_at,
      last_seen_at: device.last_seen_at,
      changed_at: changedAt,
      engines,
    };
    return { ...device, presence };
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

function deviceColumns(alias: string) {
  return [
    "id", "person_id", "name", "kind", "platform", "client", "status", "created_at", "updated_at",
    "activated_at", "first_seen_at", "last_seen_at", "profile_fetched_at", "last_routes_version",
    "absence_notified_at", "revoked_at",
  ]
    .map((column) => `${alias}.${column}`)
    .join(", ");
}

export class ServiceError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
