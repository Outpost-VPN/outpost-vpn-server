import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { version } from "../version";
import { apiFromEnvironment, type OutpostApi } from "./api";

type Result = { content: Array<{ type: "text"; text: string }> };

export async function runMcp(api: OutpostApi = apiFromEnvironment()) {
  const server = new McpServer({ name: "outpost", version });

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
    description: "Возвращает единственную секретную ссылку и варианты подписки для подключения.",
    inputSchema: {
      connection_id: z.string().uuid(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ connection_id }) => result(await api.get(`/api/v1/connections/${connection_id}/subscription`)));

  server.registerTool("connection_rotate", {
    title: "Перевыпустить подключение",
    description: "Сразу отключает прежнюю ссылку и создаёт новые credentials для всего подключения.",
    inputSchema: { connection_id: z.string().uuid() },
    annotations: { destructiveHint: true },
  }, async ({ connection_id }) => result(await api.post(`/api/v1/connections/${connection_id}/rotate`, {})));

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
    description: "Возвращает immutable preview и confirmation ID. Ничего не применяет.",
    inputSchema: {
      action: z.enum(["service.restart", "service.start", "service.stop", "engine.update", "nginx.reload", "update.apply", "backup.export"]),
      payload: z.record(z.string(), z.unknown()).default({}),
    },
    annotations: { readOnlyHint: true },
  }, async ({ action, payload }) => result(await api.post("/api/v1/operations/preview", { action, payload })));

  server.registerTool("operation_confirm", {
    title: "Подтвердить опасную операцию",
    description: "Применяет ровно тот preview, которому соответствует confirmation ID и payload.",
    inputSchema: {
      confirmation_id: z.string().uuid(),
      action: z.enum(["service.restart", "service.start", "service.stop", "engine.update", "nginx.reload", "update.apply", "backup.export"]),
      payload: z.record(z.string(), z.unknown()).default({}),
    },
    annotations: { destructiveHint: true },
  }, async ({ confirmation_id, action, payload }) => result(await api.post("/api/v1/operations/confirm", {
    confirmationId: confirmation_id,
    action,
    payload,
  })));

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function result(value: unknown): Result {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
