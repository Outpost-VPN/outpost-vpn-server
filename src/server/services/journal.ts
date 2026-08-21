import type { OutpostDatabase, SqlValue } from "../db/database";
import type {
  JournalCategory,
  JournalEventInput,
  JournalKind,
  JournalOutcome,
  JournalSeverity,
} from "../models";
import type { Locale } from "../../shared/i18n";
import { journalActor, journalPresentation } from "./journal-locales";

type EventData = Record<string, unknown>;

type EventDefinition = {
  category: JournalCategory;
  kind: JournalKind;
  severity?: JournalSeverity;
  outcome?: JournalOutcome;
  important?: boolean;
  title: string | ((data: EventData) => string);
  description?: string | ((data: EventData) => string);
};

export type JournalScope = "all" | "important" | "errors" | "changes";

export type JournalQuery = {
  scope?: JournalScope;
  category?: JournalCategory | JournalCategory[];
  q?: string;
  before?: number;
  limit?: number;
  language?: Locale;
};

export type JournalEvent = {
  id: number;
  type: string;
  category: JournalCategory;
  kind: JournalKind;
  severity: JournalSeverity;
  outcome: JournalOutcome;
  important: boolean;
  source: string;
  actor: { id: string; label: string } | null;
  subject: { type: string; id: string; label: string } | null;
  operation_id: string | null;
  audit_id: number | null;
  title: string;
  description: string;
  details: { component: string; data: EventData; changes: unknown };
  occurred_at: string;
};

export type JournalPage = { events: JournalEvent[]; total: number; next: number | null };
type JournalRecord = Omit<JournalEventInput, "type" | "category" | "kind" | "source"> & { source?: string };
type AuditRecord = Parameters<OutpostDatabase["audit"]>[0];

const definitions: Record<string, EventDefinition> = {
  "connection.created": change("connections", "Подключение создано", connectionDescription),
  "connection.updated": change("connections", "Подключение изменено", connectionDescription),
  "connection.activated": change("connections", "Подключение готово", connectionDescription),
  "connection.rotation_started": started("connections", "Перевыпуск credentials начат"),
  "connection.rotated": change("connections", "Credentials перевыпущены", connectionDescription, true),
  "connection.rotation_failed": failed("connections", "Не удалось перевыпустить credentials"),
  "connection.archived": change("connections", "Подключение перенесено в архив", connectionDescription, true),
  "connection.first_used": activity("connections", "Ссылка впервые использована", connectionDescription),
  "connection.first_seen": activity("connections", "Подключение впервые активно", connectionDescription),
  "connection.offline_long": incident("connections", "Подключение давно не использовалось", connectionDescription, "warning"),
  "connection.returned": recovered("connections", "Подключение снова активно", connectionDescription),

  "routes.published": change("routes", (d) => `Опубликована ревизия маршрутов №${number(d.version)}`, routesDescription),
  "routes.rolled_back": change("routes", (d) => `Маршруты возвращены к ревизии №${number(d.targetVersion ?? d.version)}`, routesRollbackDescription, true),
  "routes.neutralized": change("routes", "Региональные системные маршруты удалены", routesDescription),

  "rulesets.updated": change("system", (d) => `GeoIP/Geosite обновлены до ${named(d, "version")}`),
  "rulesets.update_failed": incident("system", "Не удалось обновить GeoIP/Geosite", (d) => named(d, "error"), "warning", true),

  "engine.order_changed": change("engines", "Порядок подключения движков изменён", engineOrderDescription),
  "engine.config_applied": change("engines", (d) => `Конфигурация ${engineLabel(d.engine)} применена`, versionDescription),
  "engine.config_rolled_back": change("engines", (d) => `Конфигурация ${engineLabel(d.engine)} восстановлена`, versionDescription, true),
  "engine.telemetry_unavailable": incident("engines", (d) => `Телеметрия ${engineLabel(d.engine)} недоступна`, "Статусы подключений временно неизвестны", "warning"),
  "engine.telemetry_restored": recovered("engines", (d) => `Телеметрия ${engineLabel(d.engine)} восстановлена`, "Получение статусов и трафика снова работает"),

  "backup.started": started("maintenance", "Создание резервной копии начато"),
  "backup.created": succeeded("maintenance", "Резервная копия создана", backupDescription),
  "backup.failed": failed("maintenance", "Не удалось создать резервную копию"),
  "service.restart_started": started("maintenance", (d) => `Перезапуск службы «${serviceLabel(d.service)}» начат`),
  "service.restarted": succeeded("maintenance", (d) => `Служба «${serviceLabel(d.service)}» перезапущена`),
  "service.restart_failed": failed("maintenance", (d) => `Не удалось перезапустить службу «${serviceLabel(d.service)}»`),
  "service.start_started": started("maintenance", (d) => `Запуск службы «${serviceLabel(d.service)}» начат`),
  "service.started": succeeded("maintenance", (d) => `Служба «${serviceLabel(d.service)}» запущена`),
  "service.start_failed": failed("maintenance", (d) => `Не удалось запустить службу «${serviceLabel(d.service)}»`),
  "service.stop_started": started("maintenance", (d) => `Остановка службы «${serviceLabel(d.service)}» начата`),
  "service.stopped": succeeded("maintenance", (d) => `Служба «${serviceLabel(d.service)}» остановлена`),
  "service.stop_failed": failed("maintenance", (d) => `Не удалось остановить службу «${serviceLabel(d.service)}»`),
  "nginx.reload_started": started("maintenance", "Перезагрузка Nginx начата"),
  "nginx.reloaded": succeeded("maintenance", "Nginx перезагружен"),
  "nginx.reload_failed": failed("maintenance", "Не удалось перезагрузить Nginx"),
  "engine.update_started": started("maintenance", (d) => `Обновление ${engineLabel(d.engine)} начато`, versionDescription),
  "engine.updated": succeeded("maintenance", (d) => `${engineLabel(d.engine)} обновлён`, versionDescription),
  "engine.update_failed": failed("maintenance", (d) => `Не удалось обновить ${engineLabel(d.engine)}`, versionDescription),
  "app.update_started": started("maintenance", "Обновление Outpost начато", versionDescription),
  "app.updated": succeeded("maintenance", "Outpost обновлена", versionDescription),
  "app.update_failed": failed("maintenance", "Не удалось обновить Outpost", versionDescription),

  "auth.login_succeeded": activity("security", "Владелец вошёл в панель", userAgentDescription),
  "passkey.registered": change("security", "Ключ доступа зарегистрирован", userAgentDescription),
  "passkey.revoked": change("security", "Ключ доступа отозван", undefined, true),
  "session.revoked": change("security", "Сеанс завершён"),
  "sessions.revoked_others": change("security", "Другие сеансы завершены", (d) => `Завершено сеансов: ${number(d.revoked)}`),
  "token.created": change("security", "API-токен создан", (d) => named(d, "name"), true),
  "token.revoked": change("security", "API-токен отозван", (d) => named(d, "name"), true),
  "bootstrap.reset": incident("security", "Настройка владельца сброшена", undefined, "critical", true),

  "service.unavailable": incident("system", (d) => `Служба «${serviceLabel(d.service)}» недоступна`, undefined, "error", true),
  "service.restored": recovered("system", (d) => `${serviceLabel(d.service)} снова работает`),
  "system.disk_warning": incident("system", "На диске заканчивается место", percentDescription, "warning", true),
  "system.disk_critical": incident("system", "На диске критически мало места", percentDescription, "critical", true),
  "system.disk_restored": recovered("system", "Свободное место на диске восстановлено", percentDescription),
  "system.tls_warning": incident("system", "Срок TLS-сертификата скоро истечёт", daysDescription, "warning", true),
  "system.tls_critical": incident("system", "TLS-сертификат требует срочного обновления", daysDescription, "critical", true),
  "system.tls_restored": recovered("system", "TLS-сертификат снова в норме", daysDescription),
};

type EventRow = {
  id: number;
  type: string;
  category: JournalCategory;
  kind: JournalKind;
  severity: JournalSeverity;
  outcome: JournalOutcome;
  important: number;
  source: string;
  actor: string | null;
  subject_type: string | null;
  subject_id: string | null;
  operation_id: string | null;
  audit_id: number | null;
  data_json: string;
  occurred_at: string;
  before_json: string | null;
  after_json: string | null;
};

export class JournalService {
  constructor(private db: OutpostDatabase) {}

  record(type: string, entry: JournalRecord = {}) {
    const definition = definitions[type];
    if (!definition) throw new Error(`Неизвестный тип события: ${type}`);
    return this.db.event({
      type,
      category: definition.category,
      kind: definition.kind,
      severity: entry.severity ?? definition.severity ?? "info",
      outcome: entry.outcome === undefined ? definition.outcome ?? null : entry.outcome,
      important: entry.important ?? definition.important ?? false,
      source: entry.source ?? type.split(".")[0]!,
      actor: entry.actor,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      operationId: entry.operationId,
      auditId: entry.auditId,
      data: sanitize(entry.data ?? {}) as EventData,
      occurredAt: entry.occurredAt,
    });
  }

  change<T>(
    type: string,
    mutate: () => T,
    audit: (value: T) => AuditRecord,
    event: (value: T) => JournalRecord,
  ): T {
    return this.db.raw.transaction(() => {
      const value = mutate();
      const auditId = this.db.audit(audit(value));
      this.record(type, { ...event(value), auditId });
      return value;
    })();
  }

  list(query: JournalQuery = {}): JournalPage {
    const scope = query.scope ?? "all";
    const limit = Math.max(1, Math.min(100, Math.trunc(query.limit ?? 50)));
    const clauses: string[] = [];
    const values: SqlValue[] = [];
    const categories = Array.isArray(query.category) ? query.category : query.category ? [query.category] : [];
    if (categories.length) {
      clauses.push(`events.category IN (${categories.map(() => "?").join(", ")})`);
      values.push(...categories);
    }
    if (scope === "important") clauses.push("(events.important = 1 OR events.severity IN ('warning', 'error', 'critical'))");
    if (scope === "errors") clauses.push("events.severity IN ('error', 'critical')");
    if (scope === "changes") clauses.push("events.kind = 'change'");

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.raw.query<EventRow, SqlValue[]>(`
      SELECT events.*, audit_log.before_json, audit_log.after_json
      FROM events
      LEFT JOIN audit_log ON audit_log.id = events.audit_id
      ${where}
      ORDER BY events.occurred_at DESC, events.id DESC
    `).all(...values).map((row) => this.render(row, query.language ?? "ru"));

    const term = query.q?.trim().toLocaleLowerCase("ru") ?? "";
    const searched: JournalEvent[] = term
      ? rows.filter((event) => searchable(event).toLocaleLowerCase("ru").includes(term))
      : rows;
    const beforeIndex = query.before ? searched.findIndex((event) => event.id === query.before) : -1;
    const available = beforeIndex >= 0 ? searched.slice(beforeIndex + 1) : searched;
    const events = available.slice(0, limit);
    return {
      events,
      total: searched.length,
      next: available.length > limit ? events.at(-1)?.id ?? null : null,
    };
  }

  latest(limit = 8): JournalEvent[] {
    return this.list({ limit }).events;
  }

  private render(row: EventRow, language: Locale): JournalEvent {
    const data = parseObject(row.data_json);
    const definition = definitions[row.type] ?? {
      category: row.category,
      kind: row.kind,
      title: row.type,
      description: "",
    };
    const fallbackTitle = value(definition.title, data);
    const fallbackDescription = definition.description ? value(definition.description, data) : "";
    const presented = journalPresentation(row.type, data, language, fallbackTitle, fallbackDescription);
    const subject = row.subject_type && row.subject_id
      ? { type: row.subject_type, id: row.subject_id, label: subjectLabel(data, row.subject_type, row.subject_id) }
      : null;
    const changes = row.before_json || row.after_json
      ? { before: sanitize(parse(row.before_json)), after: sanitize(parse(row.after_json)) }
      : null;
    return {
      id: row.id,
      type: row.type,
      category: row.category,
      kind: row.kind,
      severity: row.severity,
      outcome: row.outcome,
      important: Boolean(row.important),
      source: row.source,
      actor: row.actor ? { id: row.actor, label: journalActor(actorLabel(this.db, row.actor), language) } : null,
      subject,
      operation_id: row.operation_id,
      audit_id: row.audit_id,
      title: presented.title,
      description: presented.description,
      details: {
        component: row.source,
        data,
        changes,
      },
      occurred_at: row.occurred_at,
    };
  }
}

export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKey(key)) continue;
    result[key] = sanitize(item);
  }
  return result;
}

export function parseUserAgent(userAgent?: string | null) {
  if (!userAgent) return { browser: "Неизвестный браузер", os: "Неизвестная система" };
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /Firefox\//.test(userAgent) ? "Firefox"
      : /CriOS\//.test(userAgent) || /Chrome\//.test(userAgent) ? "Chrome"
        : /Safari\//.test(userAgent) ? "Safari" : "Другой браузер";
  const os = /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Mac OS X/.test(userAgent) ? "macOS"
      : /Android/.test(userAgent) ? "Android"
        : /Windows/.test(userAgent) ? "Windows"
          : /Linux/.test(userAgent) ? "Linux" : "Неизвестная система";
  return { browser, os };
}

function change(category: JournalCategory, title: EventDefinition["title"], description?: EventDefinition["description"], important = false): EventDefinition {
  return { category, kind: "change", severity: "info", outcome: "succeeded", important, title, description };
}

function activity(category: JournalCategory, title: EventDefinition["title"], description?: EventDefinition["description"]): EventDefinition {
  return { category, kind: "activity", severity: "info", outcome: "succeeded", title, description };
}

function incident(category: JournalCategory, title: EventDefinition["title"], description?: EventDefinition["description"], severity: JournalSeverity = "error", important = true): EventDefinition {
  return { category, kind: "incident", severity, outcome: "failed", important, title, description };
}

function recovered(category: JournalCategory, title: EventDefinition["title"], description?: EventDefinition["description"]): EventDefinition {
  return { category, kind: "incident", severity: "info", outcome: "recovered", title, description };
}

function started(category: JournalCategory, title: EventDefinition["title"], description?: EventDefinition["description"], important = false): EventDefinition {
  return { category, kind: "activity", severity: "info", outcome: "started", important, title, description };
}

function succeeded(category: JournalCategory, title: EventDefinition["title"], description?: EventDefinition["description"]): EventDefinition {
  return { category, kind: "activity", severity: "info", outcome: "succeeded", title, description };
}

function failed(category: JournalCategory, title: EventDefinition["title"], description?: EventDefinition["description"]): EventDefinition {
  return { category, kind: "incident", severity: "error", outcome: "failed", important: true, title, description };
}

function value(source: string | ((data: EventData) => string), data: EventData) {
  return typeof source === "function" ? source(data) : source;
}

function parse(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function parseObject(value: string): EventData {
  const parsed = parse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? sanitize(parsed) as EventData : {};
}

function sensitiveKey(key: string) {
  const normalized = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
  return [
    "token", "password", "passphrase", "secret", "credential", "challenge", "authorization", "cookie",
    "ciphertext", "privatekey", "destination", "domain", "address", "url", "path",
  ].some((part) => normalized.includes(part)) || normalized === "ip" || normalized.endsWith("ip");
}

function searchable(event: JournalEvent) {
  return [
    event.type,
    event.title,
    event.description,
    event.source,
    event.actor?.label,
    event.subject?.label,
    JSON.stringify(event.details.data),
    JSON.stringify(event.details.changes),
  ].filter(Boolean).join(" ");
}

function actorLabel(db: OutpostDatabase, actor: string) {
  const labels: Record<string, string> = {
    owner: "Владелец",
    system: "Система",
    "root-cli": "Командная строка сервера",
    monitor: "Мониторинг",
    telemetry: "Телеметрия",
    demo: "Демо-режим",
  };
  if (labels[actor]) return labels[actor];
  const owner = db.raw.query<{ id: string }, string>("SELECT id FROM owners WHERE id = ?").get(actor);
  if (owner) return "Владелец";
  const token = db.raw.query<{ name: string }, string>("SELECT name FROM api_tokens WHERE id = ?").get(actor);
  if (token) return `API-токен «${token.name}»`;
  return "Неизвестный источник";
}

function subjectLabel(data: EventData, type: string, id: string) {
  if (type === "engine") return engineLabel(data.engine ?? id);
  if (type === "service") return serviceLabel(data.service ?? id);
  if (type === "route_revision") return `Ревизия №${number(data.version ?? data.newVersion)}`;
  if (type === "owner") return "Владелец";
  for (const key of ["connectionName", "name", "service", "engine"]) {
    if (typeof data[key] === "string" && data[key]) return String(data[key]);
  }
  return "Объект события";
}

function named(data: EventData, key: string) {
  return typeof data[key] === "string" && data[key] ? String(data[key]) : "";
}

function number(value: unknown) {
  return typeof value === "number" || typeof value === "string" ? value : "—";
}

function connectionDescription(data: EventData) {
  return named(data, "connectionName");
}

function routesDescription(data: EventData) {
  const parts = [`${number(data.rulesCount ?? data.rules)} правил`];
  if (typeof data.note === "string" && data.note) parts.push(data.note);
  return parts.join(" · ");
}

function routesRollbackDescription(data: EventData) {
  return `Предыдущая ревизия: №${number(data.fromVersion)} · Новая активная: №${number(data.newVersion ?? data.version)}`;
}

function engineOrderDescription(data: EventData) {
  return Array.isArray(data.order) ? data.order.map(engineLabel).join(" → ") : "";
}

function engineLabel(engine: unknown) {
  if (engine === "hysteria") return "Hysteria 2";
  if (engine === "xray") return "Xray";
  return typeof engine === "string" ? engine : "движка";
}

function serviceLabel(service: unknown) {
  const labels: Record<string, string> = {
    "outpost": "Outpost", "hysteria-server": "Hysteria 2", xray: "Xray", nginx: "Nginx",
    "vless-xhttp": "VLESS XHTTP", "vless-grpc": "VLESS gRPC",
  };
  return typeof service === "string" ? labels[service] ?? service : "службы";
}

function versionDescription(data: EventData) {
  const from = data.fromVersion ?? data.previousVersion;
  const to = data.version ?? data.toVersion;
  if (from && to) return `${from} → ${to}`;
  return to ? `Версия ${to}` : "";
}

function backupDescription(data: EventData) {
  const size = typeof data.size === "number" ? `${Math.max(1, Math.round(data.size / 1024))} КБ` : "";
  return ["Зашифрованный архив", size].filter(Boolean).join(" · ");
}

function userAgentDescription(data: EventData) {
  return [named(data, "browser"), named(data, "os")].filter(Boolean).join(" · ");
}

function percentDescription(data: EventData) {
  return data.percent === undefined ? "" : `Использовано ${number(data.percent)}%`;
}

function daysDescription(data: EventData) {
  return data.days === undefined ? "" : `До окончания ${number(data.days)} дн.`;
}
