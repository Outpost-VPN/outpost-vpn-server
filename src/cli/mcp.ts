import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { version } from "../version";
import { apiFromEnvironment, type MatreshkaApi } from "./api";

type Result = { content: Array<{ type: "text"; text: string }> };

export async function runMcp(api: MatreshkaApi = apiFromEnvironment()) {
  const server = new McpServer({ name: "matreshka", version });

  server.registerTool("matreshka_status", {
    title: "Состояние Matreshka",
    description: "Читает минимальное состояние панели, служб и TLS без персональных данных и настроек.",
    annotations: { readOnlyHint: true },
  }, async () => result(await api.get("/api/v1/status")));

  server.registerTool("traffic_get", {
    title: "Трафик",
    description: "Показывает агрегированный трафик по людям и устройствам.",
    inputSchema: { period: z.enum(["24h", "7d", "30d", "all"]).default("30d") },
    annotations: { readOnlyHint: true },
  }, async ({ period }) => result(await api.get(`/api/v1/traffic?period=${period}`)));

  server.registerTool("people_list", {
    title: "Люди и устройства",
    description: "Возвращает людей и их устройства без credentials и subscription tokens.",
    annotations: { readOnlyHint: true },
  }, async () => result(await api.get("/api/v1/people")));

  server.registerTool("person_create", {
    title: "Добавить человека",
    description: "Создаёт человека. Устройство добавляется отдельным инструментом.",
    inputSchema: {
      name: z.string().min(1).max(80),
      note: z.string().max(500).default(""),
      color: z.enum(["blue", "green", "peach", "violet", "slate"]).default("blue"),
    },
  }, async (input) => result(await api.post("/api/v1/people", input)));

  server.registerTool("device_create", {
    title: "Добавить устройство",
    description: "Создаёт отдельные credentials и одноразовое приглашение для устройства.",
    inputSchema: {
      person_id: z.string().uuid(),
      name: z.string().min(1).max(80),
      platform: z.enum(["ios", "macos", "android", "windows", "linux", "unknown"]).default("unknown"),
      client: z.enum(["incy", "mihomo"]).default("incy"),
    },
  }, async ({ person_id, ...input }) => result(await api.post(`/api/v1/people/${person_id}/devices`, input)));

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
      action: z.enum(["device.revoke", "service.restart", "service.start", "service.stop", "engine.update", "nginx.reload", "update.apply", "backup.export"]),
      payload: z.record(z.string(), z.unknown()).default({}),
    },
    annotations: { readOnlyHint: true },
  }, async ({ action, payload }) => result(await api.post("/api/v1/operations/preview", { action, payload })));

  server.registerTool("operation_confirm", {
    title: "Подтвердить опасную операцию",
    description: "Применяет ровно тот preview, которому соответствует confirmation ID и payload.",
    inputSchema: {
      confirmation_id: z.string().uuid(),
      action: z.enum(["device.revoke", "service.restart", "service.start", "service.stop", "engine.update", "nginx.reload", "update.apply", "backup.export"]),
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
