import type { OutpostDatabase } from "../db/database";
import { now } from "../db/database";
import type { EngineRuntimeService } from "./engine-runtime";
import { ConnectionService, ServiceError } from "./connections";

type ConnectionEngine = Pick<EngineRuntimeService, "add" | "rotate" | "revoke">;
type SyncKind = "activate" | "rotate" | "revoke" | "suspend" | "resume";
type SyncStatus = "pending" | "running" | "failed" | "completed" | "cancelled";

type SyncJob = {
  id: string;
  connection_id: string;
  generation: number;
  previous_generation: number | null;
  kind: SyncKind;
  status: SyncStatus;
  actor: string;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export class ConnectionSyncService {
  private draining = false;
  private locks = new Map<string, Promise<void>>();

  constructor(
    private db: OutpostDatabase,
    private connections: ConnectionService,
    private engines: ConnectionEngine,
  ) {}

  recoverInterrupted() {
    const timestamp = now();
    this.db.raw.query(`
      UPDATE connection_sync_jobs
      SET status = 'failed', next_attempt_at = ?,
        last_error = 'Процесс остановился во время синхронизации', updated_at = ?
      WHERE status = 'running'
    `).run(timestamp, timestamp);
  }

  async activate(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (connection.status === "active") return this.connection(connectionId);
    if (connection.status !== "provisioning") throw new ServiceError(409, "Подключение нельзя активировать в текущем состоянии");
    await this.run(connectionId);
    return this.connection(connectionId);
  }

  async retry(connectionId: string) {
    const connection = this.connections.get(connectionId, true);
    const job = this.open(connectionId);
    if (!job && (connection.status === "active" || connection.status === "archived")) return this.connection(connectionId, true);
    if (!job) throw new ServiceError(409, "Для подключения нет незавершённой задачи");
    const timestamp = now();
    this.db.raw.query(`
      UPDATE connection_sync_jobs SET status = 'pending', next_attempt_at = ?, last_error = NULL, updated_at = ?
      WHERE id = ? AND status = 'failed'
    `).run(timestamp, timestamp, job.id);
    await this.run(connectionId);
    return this.connection(connectionId, true);
  }

  async rotate(connectionId: string, actor = "owner") {
    this.connections.prepareRotation(connectionId, actor);
    await this.run(connectionId);
    return this.connection(connectionId);
  }

  async suspend(connectionId: string, actor = "owner") {
    const connection = this.connections.get(connectionId);
    if (connection.status !== "active") throw new ServiceError(409, "Подключение пока нельзя приостановить");
    const job = this.open(connectionId);
    if (!connection.suspended_at || job?.kind === "resume") this.connections.prepareSuspend(connectionId, actor);
    if (this.open(connectionId)?.kind === "suspend") await this.run(connectionId);
    return this.connection(connectionId);
  }

  async resume(connectionId: string, actor = "owner") {
    const connection = this.connections.get(connectionId);
    if (connection.status !== "active") throw new ServiceError(409, "Подключение пока нельзя возобновить");
    if (!connection.suspended_at) return this.connection(connectionId);
    const job = this.open(connectionId);
    if (job?.kind !== "resume") this.connections.prepareResume(connectionId, actor);
    await this.run(connectionId);
    return this.connection(connectionId);
  }

  async archive(connectionId: string, actor = "owner") {
    this.connections.prepareArchive(connectionId, actor);
    await this.run(connectionId);
    return this.connection(connectionId, true);
  }

  connection(connectionId: string, includeArchived = false) {
    const connection = this.connections.get(connectionId, includeArchived);
    const job = this.latest(connectionId);
    const failed = job?.status === "failed";
    if (connection.status === "active") {
      if (connection.suspended_at) {
        const state = job?.kind === "resume" && job.status !== "completed" && job.status !== "cancelled"
          ? failed ? "resume_retry" as const : "resuming" as const
          : job?.kind === "suspend" && job.status !== "completed" && job.status !== "cancelled"
            ? failed ? "suspension_retry" as const : "suspending" as const
            : "suspended" as const;
        return {
          state,
          connection,
          subscription: null,
          error: failed ? job?.last_error ?? null : null,
          nextAttemptAt: failed ? job?.next_attempt_at ?? null : null,
        };
      }
      return {
        state: "ready" as const,
        connection,
        subscription: this.connections.subscription(connectionId),
        error: null,
        nextAttemptAt: null,
      };
    }
    if (connection.status === "archived") {
      return { state: "archived" as const, connection, subscription: null, error: null, nextAttemptAt: null };
    }
    const state = connection.status === "rotating"
      ? failed ? "rotation_retry" as const : "rotating" as const
      : connection.status === "archiving"
        ? failed ? "archive_retry" as const : "archiving" as const
        : failed ? "retrying" as const : "provisioning" as const;
    return {
      state,
      connection,
      subscription: null,
      error: job?.last_error ?? null,
      nextAttemptAt: job?.next_attempt_at ?? null,
    };
  }

  async drain(limit = 20) {
    if (this.draining) return { processed: 0 };
    this.draining = true;
    let processed = 0;
    try {
      const jobs = this.db.raw.query<{ connection_id: string }, [string, number]>(`
        SELECT connection_id FROM connection_sync_jobs
        WHERE status IN ('pending', 'failed') AND next_attempt_at <= ?
        ORDER BY created_at LIMIT ?
      `).all(now(), limit);
      for (const job of jobs) {
        try {
          if (await this.run(job.connection_id, false)) processed += 1;
        } catch (error) {
          console.error(`[CONNECTION_SYNC] ${job.connection_id}:`, safeError(error));
        }
      }
      return { processed };
    } finally {
      this.draining = false;
    }
  }

  list() {
    return this.db.raw.query<SyncJob, []>("SELECT * FROM connection_sync_jobs ORDER BY created_at DESC").all();
  }

  private async run(connectionId: string, force = true) {
    const job = this.open(connectionId);
    if (!job) return false;
    const timestamp = now();
    const claimed = force
      ? this.db.raw.query(`
          UPDATE connection_sync_jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
          WHERE id = ? AND status IN ('pending', 'failed')
        `).run(timestamp, job.id)
      : this.db.raw.query(`
          UPDATE connection_sync_jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
          WHERE id = ? AND status IN ('pending', 'failed') AND next_attempt_at <= ?
        `).run(timestamp, job.id, timestamp);
    if (!claimed.changes) return false;
    const current = this.job(job.id);
    return this.withLock(connectionId, async () => {
      try {
        if (current.kind === "activate") await this.engines.add(connectionId, current.generation);
        if (current.kind === "rotate") await this.engines.rotate(connectionId, current.previous_generation!, current.generation);
        if (current.kind === "suspend") await this.engines.revoke(connectionId, current.generation);
        if (current.kind === "resume") await this.engines.add(connectionId, current.generation);
        if (current.kind === "revoke") {
          const active = this.db.raw.query<{ generation: number }, string>(`
            SELECT generation FROM credentials
            WHERE connection_id = ? AND state = 'active' LIMIT 1
          `).get(connectionId);
          if (active) await this.engines.revoke(connectionId, active.generation);
        }
        if (current.kind === "revoke") this.connections.completeArchive(connectionId, current.actor);
        else if (current.kind === "suspend") this.connections.completeSuspend(connectionId, current.actor);
        else if (current.kind === "resume") this.connections.completeResume(connectionId, current.actor);
        else this.connections.completeActivation(connectionId, current.generation, current.actor);
        this.complete(current.id);
        return true;
      } catch (error) {
        const failedAt = now();
        this.db.raw.query(`
          UPDATE connection_sync_jobs
          SET status = 'failed', next_attempt_at = ?, last_error = ?, updated_at = ?
          WHERE id = ? AND status = 'running'
        `).run(nextRetry(current.attempts), safeError(error), failedAt, current.id);
        if (force) console.error(`[CONNECTION_SYNC] ${current.kind} ${current.id} queued for retry:`, safeError(error));
        return false;
      }
    });
  }

  private complete(id: string) {
    const timestamp = now();
    this.db.raw.query(`
      UPDATE connection_sync_jobs SET status = 'completed', next_attempt_at = ?,
        last_error = NULL, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'running'
    `).run(timestamp, timestamp, timestamp, id);
  }

  private job(id: string) {
    const job = this.db.raw.query<SyncJob, string>("SELECT * FROM connection_sync_jobs WHERE id = ?").get(id);
    if (!job) throw new Error(`Connection sync job ${id} not found`);
    return job;
  }

  private latest(connectionId: string) {
    return this.db.raw.query<SyncJob, string>(`
      SELECT * FROM connection_sync_jobs WHERE connection_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(connectionId) ?? null;
  }

  private open(connectionId: string) {
    return this.db.raw.query<SyncJob, string>(`
      SELECT * FROM connection_sync_jobs WHERE connection_id = ?
        AND status IN ('pending', 'running', 'failed') ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(connectionId) ?? null;
  }

  private async withLock<T>(connectionId: string, task: () => Promise<T>) {
    const previous = this.locks.get(connectionId) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    this.locks.set(connectionId, queued);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(connectionId) === queued) this.locks.delete(connectionId);
    }
  }
}

function nextRetry(attempts: number) {
  const seconds = Math.min(300, 5 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
