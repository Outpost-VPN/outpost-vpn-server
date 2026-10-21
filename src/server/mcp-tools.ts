import {methodInputSchema} from "../shared/connection-methods";
import {engineIds} from "../shared/engines";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { version } from "../version";
import type { OutpostApi } from "../shared/api";
import { settingsPatchSchema } from "../shared/settings";
import {diagnosticSchema, eventQuerySchema, trafficQuerySchema, queryString} from "../shared/diagnostics";

type Result = { content: Array<{ type: "text"; text: string }> };

export function createMcpServer(api: OutpostApi) {
  const server = new McpServer({ name: "outpost", version });

  server.registerTool("settings_get", {
    title: "Настройки Outpost",
    description: "Читает настройки панели и клиентских профилей: IPv6, QUIC, DNS mode и распознавание доменов Mihomo. Требует settings:read.",
    annotations: { readOnlyHint: true },
  }, async () => result(await api.get("/api/v1/settings")));

  server.registerTool("settings_update", {
    title: "Изменить настройки Outpost",
    description: "Частично обновляет настройки в базе и новых ответах подписки без релиза и перезапуска служб. Требует settings:write. Клиенты должны обновить и применить подписку. IPv6 включайте при рабочем IPv6 на сервере. QUIC применяется к полным профилям; DNS mode и sniffing — только Mihomo. Отдельные URI не переносят эти настройки.",
    inputSchema: settingsPatchSchema.shape,
    annotations: { destructiveHint: false, idempotentHint: true },
  }, async (input) => result(await api.patch("/api/v1/settings", input)));

  server.registerTool("outpost_status", {
    title: "Состояние Outpost",
    description: "Читает минимальное состояние панели, служб и TLS без персональных данных и настроек.",
    annotations: { readOnlyHint: true },
  }, async () => result(await api.get("/api/v1/status")));

  server.registerTool("traffic_get", {
    title: "Трафик",
    description: "Показывает агрегированный трафик по подключениям.",
    inputSchema: { period: z.enum(["24h", "7d", "30d", "all"]).default("30d"), ...trafficQuerySchema.shape },
    annotations: { readOnlyHint: true },
  }, async (input) => result(await api.get(`/api/v1/traffic?${queryString(input)}`)));

  server.registerTool("system_metrics_get", {
    title: "Ресурсы VPS", description: "CPU/steal, доступная RAM/swap, диск, ресурсы служб и сетевые счётчики с историей и свежестью. Требует system:read. Неизмеренные показатели возвращаются как null.",
    annotations: {readOnlyHint: true},
  }, async () => result(await api.get("/api/v1/system/metrics")));
  server.registerTool("connection_diagnostics_get", {
    title: "Диагностика подключения", description: "Presence по движкам, здоровье и ошибки сборщиков, причина unknown. includeEvents читает очищенные transport events за час: type/reason, исходный level, count и related для сгруппированных последствий idle disconnect. Отмена потока client_cancelled_stream и тайм-аут upstream_connect_timeout различаются. Без адресов и credentials. Требует connections:read.",
    inputSchema: {connection_id: z.string().uuid(), includeEvents: z.boolean().default(false)}, annotations: {readOnlyHint: true},
  }, async ({connection_id, includeEvents}) => result(await api.get(`/api/v1/connections/${connection_id}/diagnostics?includeEvents=${includeEvents}`)));
  server.registerTool("events_get", {
    title: "Журнал событий", description: "Фильтрованный журнал Outpost с пагинацией по времени, движку и подключению. Требует system:read.",
    inputSchema: eventQuerySchema.shape, annotations: {readOnlyHint: true},
  }, async input => result(await api.get(`/api/v1/system/events?${queryString(input)}`)));
  server.registerTool("operations_get", {
    title: "Результаты операций", description: "Состояние и сохранённый результат операции по ID либо последние операции. Требует operations:read.",
    inputSchema: {operation_id: z.string().uuid().optional()}, annotations: {readOnlyHint: true},
  }, async ({operation_id}) => result(await api.get(operation_id ? `/api/v1/operations/${operation_id}` : "/api/v1/operations")));
  server.registerTool("diagnostic_run", {
    title: "Запустить исследование сети", description: "Ограниченные DNS/TCP/TLS/HTTP/ICMP, download/upload, сравнение протоколов и Hysteria speedtest. Требует diagnostics:run. Возвращает operation ID. vantage=server измеряет VPS→origin; client требует отдельный outpostctl diagnose на устройстве, connections:secret для получения private profiles. Один прогон одновременно, максимум 256MiB/180s transfer budget. Службы не перезапускаются.",
    inputSchema: diagnosticSchema.shape, annotations: {destructiveHint: false, idempotentHint: false},
  }, async input => result(await api.post("/api/v1/diagnostics", input)));
  server.registerTool("diagnostic_get", {
    title: "Результат исследования", description: "Сохранённые этапы, точка измерения и синхронные ресурсы VPS. Требует diagnostics:read. ICMP loss/TCP retransmits/UDP drops не являются универсальным QUIC loss.",
    inputSchema: {diagnostic_id: z.string().uuid(), includeSamples: z.boolean().default(false)}, annotations: {readOnlyHint: true},
  }, async ({diagnostic_id, includeSamples}) => result(await api.get(`/api/v1/diagnostics/${diagnostic_id}?includeSamples=${includeSamples}`)));
  server.registerTool("diagnostic_cancel", {
    title: "Остановить исследование", description: "Отменяет диагностическую операцию, останавливает её пробы и сохраняет уже собранный результат. Требует diagnostics:run.",
    inputSchema: {diagnostic_id: z.string().uuid()}, annotations: {destructiveHint: false, idempotentHint: true},
  }, async ({diagnostic_id}) => result(await api.post(`/api/v1/diagnostics/${diagnostic_id}/cancel`)));

  server.registerTool("connections_list", {
    title: "Подключения",
    description: "Возвращает подключения без credentials и секретных ссылок.",
    annotations: { readOnlyHint: true },
  }, async () => result(await api.get("/api/v1/connections")));

  server.registerTool("connection_create", {
    title: "Создать подключение",
    description: "Создаёт подключение, credentials и задачу активации.",
    inputSchema: {
      name: z.string().trim().min(1).max(80),
      color: z.enum(["blue", "green", "peach", "violet", "slate"]).default("blue"),
      avatar: z.string().regex(/^avatar-(?:person|group|current|\d{1,3})$/).default("avatar-person"),
    },
  }, async (input) => result(await api.post("/api/v1/connections", input)));

  server.registerTool("connection_subscription", {
    title: "Использовать подключение",
    description: "Возвращает единственную секретную ссылку и варианты подписки для подключения. Требует scope connections:secret.",
    inputSchema: {
      connection_id: z.string().uuid(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ connection_id }) => result(await api.get(`/api/v1/connections/${connection_id}/subscription`)));

  server.registerTool("connection_rotate", {
    title: "Подготовить перевыпуск подключения",
    description: "Создаёт preview перевыпуска без изменения подключения. Для выполнения передайте тот же action и payload в operation_confirm.",
    inputSchema: { connection_id: z.string().uuid() },
  }, async ({ connection_id }) => result(await api.post("/api/v1/operations/preview", {
    action: "connection.rotate",
    payload: { connectionId: connection_id },
  })));

  server.registerTool("routes_get", {
    title: "Маршруты",
    description: "Читает draft, опубликованную ревизию и признак несохранённых изменений.",
    annotations: { readOnlyHint: true },
  }, async () => result(await api.get("/api/v1/routes")));

  server.registerTool("route_add", {
    title: "Добавить правило",
    description: "Добавляет правило в draft. Для доставки клиентам требуется routes_publish.",
    inputSchema: {
      action: z.enum(["DIRECT", "PROXY", "BLOCK"]),
      matcher: z.enum(["DOMAIN", "SUFFIX", "IP_CIDR", "GEOSITE", "GEOIP"]),
      value: z.string().min(1).max(255),
      enabled: z.boolean().default(true),
    },
  }, async (input) => result(await api.post("/api/v1/routes", input)));

  server.registerTool("routes_publish", {
    title: "Опубликовать маршруты",
    description: "Создаёт immutable revision и обновляет подписки без переимпорта.",
    inputSchema: { note: z.string().max(500).default("") },
  }, async ({ note }) => result(await api.post("/api/v1/routes/publish", { note })));

  server.registerTool("operation_preview", {
    title: "Предпросмотр опасной операции",
    description: "Возвращает immutable preview и confirmation ID. Ничего не применяет. Для connection.rotate передайте payload { connectionId: UUID }.",
    inputSchema: {
      action: z.enum(["service.restart", "service.start", "service.stop", "engine.update", "nginx.reload", "update.apply", "backup.export", "connection.rotate"]),
      payload: z.record(z.string(), z.unknown()).default({}),
    },
    annotations: { readOnlyHint: true },
  }, async ({ action, payload }) => result(await api.post("/api/v1/operations/preview", { action, payload })));

  server.registerTool("operation_confirm", {
    title: "Подтвердить опасную операцию",
    description: "Применяет ровно тот preview, которому соответствует confirmation ID и payload.",
    inputSchema: {
      confirmation_id: z.string().uuid(),
      action: z.enum(["service.restart", "service.start", "service.stop", "engine.update", "nginx.reload", "update.apply", "backup.export", "connection.rotate"]),
      payload: z.record(z.string(), z.unknown()).default({}),
    },
    annotations: { destructiveHint: true },
  }, async ({ confirmation_id, action, payload }) => result(await api.post("/api/v1/operations/confirm", {
    confirmationId: confirmation_id,
    action,
    payload,
  })));


  server.registerTool("engines_get", {
    title: "Ядра Outpost", description: "Читает установленные и закреплённые версии ядер, checksum обновлений и серверные возможности. Требует engines:read.",
    annotations: {readOnlyHint:true},
  }, async () => result(await api.get("/api/v1/engines")));
  server.registerTool("engines_check", {
    title: "Проверить версии движков",
    description: "Проверяет официальные версии и проверяемые файлы независимых обновлений. Передайте engine для одного движка. Требует engines:write; ничего не устанавливает. AWG использует отдельную подписанную сборку движка.",
    inputSchema: {engine: z.enum(engineIds as [string, ...string[]]).optional()},
    annotations: {readOnlyHint: true},
  }, async ({engine}) => result(await api.post(engine ? `/api/v1/engines/${engine}/check` : "/api/v1/engines/check")));

  server.registerTool("methods_get", {
    title: "Способы подключения", description: "Читает настроенные способы, их приоритет, серверные возможности и предлагаемые настройки. Требует engines:read.",
    annotations: {readOnlyHint:true},
  }, async () => result(await api.get("/api/v1/methods")));
  server.registerTool("method_create", {
    title: "Добавить способ подключения", description: "Создаёт способ на установленном ядре и применяет его конфигурацию. Требует engines:write. Серверные изменения могут перезапустить работающее ядро; согласуйте прерывание его подключений. После изменения клиентам нужно обновить подписку.",
    inputSchema: methodInputSchema.shape, annotations: {destructiveHint:false},
  }, async (input) => result(await api.post("/api/v1/methods", input)));
  server.registerTool("method_update", {
    title: "Настроить способ подключения", description: "Применяет полный набор настроек существующего способа. Ядро и протокол сохраняются. Требует engines:write. Серверные изменения могут перезапустить работающее ядро и затронуть все его способы; согласуйте прерывание подключений.",
    inputSchema: {method_id:z.string().min(1).max(80), method:methodInputSchema}, annotations: {destructiveHint:false, idempotentHint:true},
  }, async ({method_id, method}) => result(await api.patch("/api/v1/methods/" + encodeURIComponent(method_id), method)));
  server.registerTool("method_delete", {
    title: "Удалить способ подключения", description: "Удаляет серверный способ, сохраняя другие способы и доступы пользователей. Требует engines:write. Это прерывает работу удаляемого способа и может перезапустить его ядро; согласуйте прерывание подключений.",
    inputSchema: {method_id:z.string().min(1).max(80)}, annotations: {destructiveHint:true},
  }, async ({method_id}) => result(await api.delete("/api/v1/methods/" + encodeURIComponent(method_id))));
  server.registerTool("methods_reorder", {
    title: "Приоритет способов подключения", description: "Сохраняет полный порядок способов. Службы не перезапускаются; новый порядок приходит с обновлением совместимой подписки. Требует engines:write.",
    inputSchema: {ids:z.array(z.string().min(1).max(80))}, annotations: {destructiveHint:false, idempotentHint:true},
  }, async ({ids}) => result(await api.post("/api/v1/methods/reorder", {ids})));

  return server;
}

function result(value: unknown): Result {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
