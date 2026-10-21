import {z} from "zod";

const defaultTarget = "https://speed.cloudflare.com/__down?bytes=8388608";
export const diagnosticSchema = z.object({
  kind: z.enum(["reachability", "latency", "speed", "compare", "transport-speed"]),
  vantage: z.enum(["server", "client"]).default("server"),
  target: z.string().url().max(2048).default(defaultTarget),
  uploadTarget: z.string().url().max(2048).default("https://speed.cloudflare.com/__up"),
  family: z.enum(["ipv4", "ipv6"]).default("ipv4"),
  direction: z.enum(["download", "upload", "both"]).default("download"),
  durationSeconds: z.number().int().min(1).max(30).default(5),
  byteLimit: z.number().int().min(65_536).max(64 * 1024 * 1024).default(8 * 1024 * 1024),
  count: z.number().int().min(1).max(30).default(10),
  repeat: z.number().int().min(1).max(3).default(1),
  connectionId: z.string().uuid().optional(),
  methodIds: z.array(z.string().min(1).max(80)).max(8).default([]),
}).strict().superRefine((input, ctx) => {
  const transport = input.kind === "compare" || input.kind === "transport-speed" || input.methodIds.length > 0;
  if (input.methodIds.length && !["speed", "compare", "transport-speed"].includes(input.kind)) ctx.addIssue({code: "custom", message: "Select methods only for speed and protocol comparison tests"});
  if (transport && (input.vantage !== "client" || !input.connectionId)) ctx.addIssue({code: "custom", message: "Protocol tests require a client runner and connectionId"});
  if (input.kind === "transport-speed" && input.direction === "both" && input.repeat * input.durationSeconds * 2 > 90) ctx.addIssue({code: "custom", message: "Transport test exceeds time budget"});
  const transfers = input.repeat * (Math.max(1, input.methodIds.length) + (input.kind === "compare" ? 1 : 0)) * (input.direction === "both" ? 2 : 1);
  if (transfers * input.byteLimit > 256 * 1024 * 1024 || transfers * input.durationSeconds > 180) ctx.addIssue({code: "custom", message: "Diagnostic exceeds 256 MiB or 180 seconds; reduce methods, repeat, duration or bytes"});
});
export type DiagnosticRequest = z.infer<typeof diagnosticSchema>;
export function parseDiagnosticRequest(input: unknown): DiagnosticRequest {
  const request = diagnosticSchema.parse(input);
  if (request.target === defaultTarget) {
    const target = new URL(request.target);
    if (["reachability", "latency"].includes(request.kind)) {target.pathname = "/cdn-cgi/trace"; target.search = "";}
    else target.searchParams.set("bytes", String(request.byteLimit));
    request.target = target.href;
  }
  return request;
}
export const diagnosticReportSchema = z.object({
  stages: z.array(z.object({
    type: z.enum(["dns", "tcp", "tls", "http", "icmp", "download", "upload", "transport-speed", "client"]),
    methodId: z.string().max(80).optional(), attempt: z.number().int().min(1).max(3).optional(),
    sampledAt: z.number().int().nonnegative(), elapsedMs: z.number().nonnegative().max(300_000),
    ok: z.boolean(), code: z.string().max(80).regex(/^[A-Za-z0-9_]+$/).optional(),
    metrics: z.record(z.string().max(80), z.union([z.number().finite(), z.boolean(), z.string().max(200), z.null()])).default({}).superRefine((metrics, ctx) => {
      const fields = ["address", "family", "measurementPath", "httpStatus", "bytes", "elapsedMs", "mbps", "tcpMs", "tlsMs", "firstByteMs", "complete", "exitCode", "sent", "received", "icmpLossPercent", "minMs", "maxMs", "meanMs", "jitterMs", "downloadMbps", "uploadMbps", "downloadBytes", "uploadBytes"];
      for (const [key, value] of Object.entries(metrics)) if (!fields.includes(key) || typeof value === "string" && !["address", "family", "measurementPath"].includes(key)) ctx.addIssue({code: "custom", message: "Unsupported diagnostic metric"});
    }),
  }).strict()).max(128),
  runner: z.object({platform: z.string().max(40), interface: z.string().max(80), startedAt: z.number().int(), finishedAt: z.number().int()}).strict(),
}).strict();
export type DiagnosticReport = z.infer<typeof diagnosticReportSchema>;
export type DiagnosticStage = DiagnosticReport["stages"][number];
export type DiagnosticProfile = {methodId: string; protocol: string; family: "mihomo" | "sing-box" | "hysteria"; config: Record<string, unknown>};

export const trafficQuerySchema = z.object({
  connectionId: z.string().uuid().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(),
  includeSeries: z.boolean().default(true), resolution: z.enum(["auto", "5m", "1h", "1d"]).default("auto"), maxPoints: z.number().int().min(1).max(1000).default(200),
}).strict().refine(v => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to), "Invalid time range");

export const eventQuerySchema = z.object({
  scope: z.enum(["all", "important", "errors", "changes"]).optional(),
  engine: z.string().max(80).optional(), connectionId: z.string().uuid().optional(),
  from: z.string().datetime().optional(), to: z.string().datetime().optional(), q: z.string().max(500).optional(),
  before: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).default(50),
}).strict().refine(v => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to), "Invalid time range");

export function queryString(input: Record<string, unknown>) {
  return new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString();
}
