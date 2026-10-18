import {methodInputSchema} from "../shared/connection-methods";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { version } from "../version";
import type { OutpostApi } from "../shared/api";
import { settingsPatchSchema } from "../shared/settings";

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
    inputSchema: { period: z.enum(["24h", "7d", "30d", "all"]).default("30d") },
    annotations: { readOnlyHint: true },
  }, async ({ period }) => result(await api.get(`/api/v1/traffic?period=${period}`)));

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
