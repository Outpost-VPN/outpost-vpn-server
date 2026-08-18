import type { MatreshkaDatabase } from "../db/database";
import { now } from "../db/database";
import { config } from "../config";
import { deriveToken, hashToken, tokensEqual } from "../security";
import type { EngineRuntimeService } from "./engine-runtime";
import { JournalService } from "./journal";
import type { PeopleService } from "./people";
import { ServiceError } from "./people";

type DeviceEngine = Pick<EngineRuntimeService, "add" | "revoke">;
type SyncKind = "activate" | "revoke";
type SyncStatus = "pending" | "running" | "failed" | "completed";

type SyncJob = {
  id: string;
  device_id: string;
  invitation_id: string | null;
  kind: SyncKind;
  status: SyncStatus;
  actor: string;
  attempts: number;
  next_attempt_at: string;
};

type InvitationRow = {
  id: string;
  device_id: string;
  token_hash: string;
  status: string;
  expires_at: string;
  client: string;
};

export class DeviceSyncService {
  private draining = false;
  private journal: JournalService;

  constructor(
    private db: MatreshkaDatabase,
    private people: PeopleService,
    private engines: DeviceEngine,
    journal?: JournalService,
  ) {
    this.journal = journal ?? new JournalService(db);
  }

  recoverInterrupted() {
    this.db.raw.query(`
      UPDATE device_sync_jobs
      SET status = 'failed', next_attempt_at = ?, last_error = 'Процесс остановился во время синхронизации', updated_at = ?
      WHERE status = 'running'
    `).run(now(), now());
  }

  async redeem(token: string) {
    const prepared = this.prepareActivation(token);
    try {
      await this.process(prepared.jobId, true);
    } catch (error) {
      console.error(`[DEVICE_SYNC] Activation ${prepared.jobId} is queued for retry:`, safeError(error));
    }
    return this.redemption(prepared.redemptionToken);
  }

  redemption(token: string) {
    const row = this.db.raw.query<{
      device_id: string;
      invitation_id: string;
      expires_at: string;
      job_status: SyncStatus | null;
    }, string>(`
      SELECT redemption_sessions.device_id, redemption_sessions.invitation_id, redemption_sessions.expires_at,
        device_sync_jobs.status AS job_status
      FROM redemption_sessions
      LEFT JOIN device_sync_jobs
        ON device_sync_jobs.invitation_id = redemption_sessions.invitation_id
        AND device_sync_jobs.kind = 'activate'
      WHERE redemption_sessions.token_hash = ?
      ORDER BY device_sync_jobs.created_at DESC LIMIT 1
    `).get(hashToken(token));
    if (!row || row.expires_at <= now()) throw new ServiceError(404, "Сессия установки не найдена");
    const device = this.people.device(row.device_id);
    if (row.job_status !== "completed" || device.status !== "active") {
      return {
        pending: true as const,
        status: row.job_status ?? "pending",
        device: { id: device.id, name: device.name, client: device.client },
        redemptionToken: token,
        expiresAt: row.expires_at,
      };
    }
    return {
      ...this.people.redemption(token),
      pending: false as const,
      redemptionToken: token,
    };
  }

  async revoke(deviceId: string, actor = "owner") {
    const device = this.people.device(deviceId);
    if (device.status === "revoked") return device;
    const activating = this.openJob(deviceId, "activate");
    if (activating) throw new ServiceError(409, "Дождитесь завершения подключения устройства");
    if (device.status === "invited") return this.revokeUnprovisioned(deviceId, actor);

    let job = this.openJob(deviceId, "revoke");
    if (!job) {
      const timestamp = now();
      const id = crypto.randomUUID();
      this.db.raw.query(`
        INSERT INTO device_sync_jobs (
          id, device_id, invitation_id, kind, status, actor, attempts, next_attempt_at, created_at, updated_at
        ) VALUES (?, ?, NULL, 'revoke', 'pending', ?, 0, ?, ?, ?)
      `).run(id, deviceId, actor, timestamp, timestamp, timestamp);
      job = this.job(id);
    }
    try {
      await this.process(job.id, true);
    } catch (error) {
      throw new ServiceError(503, "Отзыв сохранён в очереди и будет повторён автоматически", { jobId: job.id });
    }
    return this.people.device(deviceId);
  }

  async drain(limit = 20) {
    if (this.draining) return { processed: 0 };
    this.draining = true;
    let processed = 0;
    try {
      const jobs = this.db.raw.query<{ id: string }, [string, number]>(`
        SELECT id FROM device_sync_jobs
        WHERE status IN ('pending', 'failed') AND next_attempt_at <= ?
        ORDER BY created_at LIMIT ?
      `).all(now(), limit);
      for (const job of jobs) {
        try {
          if (await this.process(job.id, false)) processed++;
        } catch (error) {
          console.error(`[DEVICE_SYNC] Job ${job.id} failed:`, safeError(error));
        }
      }
      return { processed };
    } finally {
      this.draining = false;
    }
  }

  list() {
    return this.db.raw.query<SyncJob & { last_error: string | null; created_at: string; updated_at: string; completed_at: string | null }, []>(
      "SELECT * FROM device_sync_jobs ORDER BY created_at DESC",
    ).all();
  }

  private prepareActivation(token: string) {
    const invitation = this.db.raw.query<InvitationRow, string>(`
      SELECT invitations.id, invitations.device_id, invitations.token_hash, invitations.status,
        invitations.expires_at, devices.client
      FROM invitations JOIN devices ON devices.id = invitations.device_id
      WHERE invitations.token_hash = ?
    `).get(hashToken(token));
    if (!invitation || !tokensEqual(token, invitation.token_hash)) throw new ServiceError(404, "Приглашение не найдено");
    if (invitation.expires_at <= now()) throw new ServiceError(410, "Срок приглашения истёк");
    if (!["pending", "redeeming"].includes(invitation.status)) {
      throw new ServiceError(410, "Приглашение уже использовано или заменено");
    }

    const redemptionToken = deriveToken("device-redemption", invitation.id);
    const expiresAt = new Date(Date.now() + config.redemptionHours * 60 * 60 * 1000).toISOString();
    let job = this.openJob(invitation.device_id, "activate");
    if (!job) {
      const timestamp = now();
      const id = crypto.randomUUID();
      this.db.raw.transaction(() => {
        this.db.raw.query("UPDATE invitations SET status = 'redeeming' WHERE id = ? AND status = 'pending'").run(invitation.id);
        this.db.raw.query(`
          INSERT INTO redemption_sessions (id, invitation_id, device_id, token_hash, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), invitation.id, invitation.device_id, hashToken(redemptionToken), expiresAt, timestamp);
        this.db.raw.query(`
          INSERT INTO device_sync_jobs (
            id, device_id, invitation_id, kind, status, actor, attempts, next_attempt_at, created_at, updated_at
          ) VALUES (?, ?, ?, 'activate', 'pending', 'invitation', 0, ?, ?, ?)
        `).run(id, invitation.device_id, invitation.id, timestamp, timestamp, timestamp);
      })();
      job = this.job(id);
    }
    const session = this.db.raw.query<{ expires_at: string }, string>(
      "SELECT expires_at FROM redemption_sessions WHERE invitation_id = ? ORDER BY created_at DESC LIMIT 1",
    ).get(invitation.id);
    return { jobId: job.id, redemptionToken, expiresAt: session?.expires_at ?? expiresAt };
  }

  private async process(id: string, force: boolean) {
    const current = this.job(id);
    if (current.status === "completed") return true;
    if (current.status === "running") return false;
    const claimed = force
      ? this.db.raw.query(`
          UPDATE device_sync_jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
          WHERE id = ? AND status IN ('pending', 'failed')
        `).run(now(), id)
      : this.db.raw.query(`
          UPDATE device_sync_jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
          WHERE id = ? AND status IN ('pending', 'failed') AND next_attempt_at <= ?
        `).run(now(), id, now());
    if (!claimed.changes) return false;
    const job = this.job(id);
    try {
      if (job.kind === "activate") {
        await this.engines.add(job.device_id);
        this.completeActivation(job);
      } else {
        await this.engines.revoke(job.device_id);
        this.completeRevocation(job);
      }
      return true;
    } catch (error) {
      const failedAt = now();
      this.db.raw.query(`
        UPDATE device_sync_jobs
        SET status = 'failed', next_attempt_at = ?, last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(nextRetry(job.attempts), safeError(error), failedAt, id);
      throw error;
    }
  }

  private completeActivation(job: SyncJob) {
    if (!job.invitation_id) throw new Error("Activation job has no invitation");
    const device = this.people.device(job.device_id);
    const timestamp = now();
    const subscriptionToken = deriveToken("device-subscription", job.device_id);
    this.db.raw.transaction(() => {
      this.db.raw.query(`
        UPDATE devices
        SET status = 'active', subscription_token_hash = ?, activated_at = COALESCE(activated_at, ?), updated_at = ?
        WHERE id = ?
      `).run(hashToken(subscriptionToken), timestamp, timestamp, job.device_id);
      this.db.raw.query("UPDATE invitations SET status = 'redeemed', redeemed_at = ? WHERE id = ?")
        .run(timestamp, job.invitation_id);
      this.completeJob(job.id, timestamp);
      const auditId = this.db.audit({ actor: "invitation", action: "devices.redeem", resource: "device", resourceId: job.device_id });
      this.journal.record("device.activated", {
        actor: "invitation",
        auditId,
        subjectType: "device",
        subjectId: job.device_id,
        data: { deviceName: device.name, personName: device.person_name },
      });
    })();
  }

  private completeRevocation(job: SyncJob) {
    const device = this.people.device(job.device_id);
    const timestamp = now();
    this.db.raw.transaction(() => {
      this.revokeRows(job.device_id, timestamp);
      this.completeJob(job.id, timestamp);
      const auditId = this.db.audit({ actor: job.actor, action: "devices.revoke", resource: "device", resourceId: job.device_id, before: device });
      this.journal.record("device.revoked", {
        actor: job.actor,
        auditId,
        subjectType: "device",
        subjectId: job.device_id,
        data: { deviceName: device.name, personName: device.person_name },
      });
    })();
  }

  private revokeUnprovisioned(deviceId: string, actor: string) {
    const device = this.people.device(deviceId);
    const timestamp = now();
    this.db.raw.transaction(() => {
      this.revokeRows(deviceId, timestamp);
      const auditId = this.db.audit({ actor, action: "devices.revoke", resource: "device", resourceId: deviceId, before: device });
      this.journal.record("device.revoked", {
        actor,
        auditId,
        subjectType: "device",
        subjectId: deviceId,
        data: { deviceName: device.name, personName: device.person_name },
      });
    })();
    return this.people.device(deviceId);
  }

  private revokeRows(deviceId: string, timestamp: string) {
    this.db.raw.query(`
      UPDATE devices SET status = 'revoked', subscription_token_hash = NULL, revoked_at = ?, updated_at = ? WHERE id = ?
    `).run(timestamp, timestamp, deviceId);
    this.db.raw.query("UPDATE credentials SET revoked_at = ? WHERE device_id = ?").run(timestamp, deviceId);
    this.db.raw.query("UPDATE invitations SET status = 'revoked' WHERE device_id = ? AND status IN ('pending', 'redeeming')").run(deviceId);
    this.db.raw.query("DELETE FROM redemption_sessions WHERE device_id = ?").run(deviceId);
  }

  private completeJob(id: string, timestamp: string) {
    this.db.raw.query(`
      UPDATE device_sync_jobs
      SET status = 'completed', next_attempt_at = ?, last_error = NULL, completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(timestamp, timestamp, timestamp, id);
  }

  private job(id: string) {
    const job = this.db.raw.query<SyncJob, string>("SELECT * FROM device_sync_jobs WHERE id = ?").get(id);
    if (!job) throw new Error(`Device sync job ${id} not found`);
    return job;
  }

  private openJob(deviceId: string, kind: SyncKind) {
    return this.db.raw.query<SyncJob, [string, SyncKind]>(`
      SELECT * FROM device_sync_jobs
      WHERE device_id = ? AND kind = ? AND status IN ('pending', 'running', 'failed')
      ORDER BY created_at DESC LIMIT 1
    `).get(deviceId, kind) ?? null;
  }
}

function nextRetry(attempts: number) {
  const seconds = Math.min(300, 5 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
