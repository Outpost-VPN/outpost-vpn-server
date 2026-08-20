import { ZodError } from "zod";
import QRCode from "qrcode";
import { config } from "./config";
import type { OutpostDatabase } from "./db/database";
import { AuthService } from "./auth/webauthn";
import { renderLinkRoutes, renderers } from "./adapters/subscriptions";
import { catalog, catalogVersion, detectPlatform, renderCatalogPage } from "./adapters/catalog";
import { ConnectionService, ServiceError } from "./services/connections";
import { RouteService } from "./services/routes";
import { TrafficService, configuredCollectors, type TrafficPeriod } from "./services/traffic";
import { OperationService } from "./services/operations";
import { SystemService } from "./services/system";
import { EngineRuntimeService } from "./services/engine-runtime";
import { EngineConfigService } from "./adapters/engines";
import { JournalService, type JournalScope } from "./services/journal";
import type { JournalCategory, SubscriptionFormat } from "./models";
import { MonitoringService } from "./services/monitoring";
import { ConnectionSyncService } from "./services/connection-sync";
import { SetupService } from "./services/setup";
import { RuleSetService } from "./services/rulesets";

type Owner = { id: string; timezone: string; scopes?: string[] };
type Handler = (context: RequestContext) => Response | Promise<Response>;

type RequestContext = {
  request: Request;
  url: URL;
  params: Record<string, string>;
  owner: Owner | null;
  json<T = unknown>(): Promise<T>;
};

type Route = { method: string; pattern: URLPattern; public: boolean; handler: Handler };

export class HttpApplication {
  readonly auth: AuthService;
  readonly connections: ConnectionService;
  readonly routes: RouteService;
  readonly traffic: TrafficService;
  readonly operations: OperationService;
  readonly system: SystemService;
  readonly engines: EngineRuntimeService;
  readonly engineConfigs: EngineConfigService;
  readonly journal: JournalService;
  readonly monitoring: MonitoringService;
  readonly connectionSync: ConnectionSyncService;
  readonly setup: SetupService;
  readonly rulesets: RuleSetService;
  private registry: Route[] = [];

  constructor(
    readonly db: OutpostDatabase,
    connectionEngine?: Pick<EngineRuntimeService, "add" | "rotate" | "revoke">,
  ) {
    this.journal = new JournalService(db);
    this.auth = new AuthService(db, this.journal);
    this.setup = new SetupService(this.auth);
    this.connections = new ConnectionService(db, this.journal);
    this.rulesets = new RuleSetService(db, this.journal);
    this.routes = new RouteService(db, this.journal, this.rulesets);
    this.traffic = new TrafficService(db, configuredCollectors(), this.journal);
    this.engines = new EngineRuntimeService(db);
    this.connectionSync = new ConnectionSyncService(db, this.connections, connectionEngine ?? this.engines);
    this.engineConfigs = new EngineConfigService(db, this.journal);
    this.operations = new OperationService(db, this.journal);
    this.system = new SystemService(db, this.journal);
    this.monitoring = new MonitoringService(db, this.journal);
    this.registerRoutes();
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const previewUrl = canonicalDemoUrl(request, url);
    if (previewUrl) return secure(Response.redirect(previewUrl, 302), requestId);
    try {
      const endpoint = this.registry.find((route) => route.method === request.method && route.pattern.test(url));
      if (endpoint) {
        const result = endpoint.pattern.exec(url);
        const params = Object.fromEntries(Object.entries(result?.pathname.groups ?? {}).map(([key, value]) => [key, value ?? ""]));
        const owner = this.auth.authenticate(cookie(request, "outpost_session"), request.headers.get("authorization") ?? undefined);
        if (!endpoint.public && !owner) throw new ServiceError(401, "Сессия истекла — войдите снова");
        if (!endpoint.public && owner && "scopes" in owner && !authorized(request.method, url.pathname, owner.scopes)) {
          throw new ServiceError(403, "API token не имеет нужного scope");
        }
        const response = await endpoint.handler({
          request,
          url,
          params,
          owner,
          json: () => readJson(request),
        });
        return secure(response, requestId);
      }
      return secure(await this.staticResponse(url), requestId);
    } catch (error) {
      const response = errorResponse(error, requestId);
      return secure(response, requestId);
    }
  }

  private registerRoutes() {
    this.get("/healthz", true, () => json({ ok: true, version: config.version }));
    this.get("/readyz", true, () => json({ ok: true, database: true }));

    this.get("/api/v1/auth/state", true, () => json(this.auth.state()));
    this.get("/api/v1/setup", true, (ctx) => json(this.setup.state(ctx.url.searchParams.get("bootstrap") ?? undefined)));
    this.post("/api/v1/setup/domain", true, async (ctx) => json(await this.setup.finalize(await ctx.json())));
    this.post("/api/v1/auth/register/options", true, async (ctx) => {
      const body = await ctx.json();
      return json(await this.auth.registrationOptions(body, ctx.owner?.id));
    });
    this.post("/api/v1/auth/register/verify", true, async (ctx) => {
      const body = await ctx.json<{ challengeId: string; response: Parameters<AuthService["finishRegistration"]>[1] }>();
      const session = await this.auth.finishRegistration(body.challengeId, body.response, ctx.request.headers.get("user-agent") ?? undefined);
      return sessionResponse(session);
    });
    this.post("/api/v1/auth/login/options", true, async () => json(await this.auth.authenticationOptions()));
    this.post("/api/v1/auth/login/verify", true, async (ctx) => {
      const body = await ctx.json<{ challengeId: string; response: Parameters<AuthService["finishAuthentication"]>[1] }>();
      const session = await this.auth.finishAuthentication(body.challengeId, body.response, ctx.request.headers.get("user-agent") ?? undefined);
      return sessionResponse(session);
    });
    this.post("/api/v1/auth/logout", false, (ctx) => {
      this.auth.logout(cookie(ctx.request, "outpost_session"));
      return json({ ok: true }, 200, { "set-cookie": expiredSessionCookie() });
    });
    this.get("/api/v1/security", false, (ctx) => {
      ownerOnly(ctx);
      return json(this.auth.security(cookie(ctx.request, "outpost_session")));
    });
    this.delete("/api/v1/passkeys/:id", false, (ctx) => {
      ownerOnly(ctx);
      this.auth.revokePasskey(ctx.params.id!, actor(ctx));
      return empty();
    });
    this.delete("/api/v1/sessions", false, (ctx) => {
      ownerOnly(ctx);
      return json(this.auth.endOtherSessions(cookie(ctx.request, "outpost_session"), actor(ctx)));
    });
    this.delete("/api/v1/sessions/:id", false, (ctx) => {
      ownerOnly(ctx);
      this.auth.revokeSession(ctx.params.id!, cookie(ctx.request, "outpost_session"), actor(ctx));
      return empty();
    });
    this.get("/api/v1/me", false, (ctx) => json({ owner: ctx.owner }));
    this.patch("/api/v1/me", false, async (ctx) => json({ owner: this.auth.updateOwner(await ctx.json(), actor(ctx)) }));

    this.get("/api/v1/status", false, () => json(this.system.status()));
    this.get("/api/v1/dashboard", false, async (ctx) => {
      ownerOnly(ctx);
      return json({
        auth: this.auth.state(),
        connections: publicConnections(this.connections.list()),
        routes: this.routes.state(),
        traffic: this.traffic.overview(period(ctx.url.searchParams.get("period")), ctx.owner?.timezone),
        system: await this.system.state(),
        settings: this.system.settings(),
        engineConfigs: this.engineConfigs.state(),
        tokens: this.auth.apiTokens(),
        operations: this.operations.list().slice(0, 5),
      });
    });

    this.get("/api/v1/connections", false, () => json({ connections: publicConnections(this.connections.list()) }));
    this.post("/api/v1/connections", false, async (ctx) => {
      const created = this.connections.create(await ctx.json(), actor(ctx));
      const state = await this.connectionSync.activate(created.id);
      return json(await this.connectionResult(state), state.state === "ready" ? 201 : 202);
    });
    this.get("/api/v1/connections/:id", false, (ctx) => json(publicConnection(this.connections.get(ctx.params.id!))));
    this.patch("/api/v1/connections/:id", false, async (ctx) => {
      return json(publicConnection(this.connections.update(ctx.params.id!, await ctx.json(), actor(ctx))));
    });
    this.delete("/api/v1/connections/:id", false, async (ctx) => {
      ownerOnly(ctx);
      return json(await this.connectionResult(await this.connectionSync.archive(ctx.params.id!, actor(ctx))), 202);
    });
    this.get("/api/v1/connections/:id/subscription", false, async (ctx) => {
      ownerOnly(ctx);
      return json(await this.connectionResult(this.connectionSync.connection(ctx.params.id!)));
    });
    this.post("/api/v1/connections/:id/retry", false, async (ctx) => {
      const state = await this.connectionSync.retry(ctx.params.id!);
      return json(await this.connectionResult(state), state.state === "ready" ? 200 : 202);
    });
    this.post("/api/v1/connections/:id/rotate", false, async (ctx) => {
      ownerOnly(ctx);
      const state = await this.connectionSync.rotate(ctx.params.id!, actor(ctx));
      return json(await this.connectionResult(state), state.state === "ready" ? 200 : 202);
    });

    this.get("/api/v1/routes", false, () => json(this.routes.state()));
    this.get("/api/v1/routes/revisions", false, () => json({ revisions: this.routes.revisions() }));
    this.get("/api/v1/routes/preview", false, () => json(this.routes.preview()));
    this.post("/api/v1/routes", false, async (ctx) => json(this.routes.add(await ctx.json(), actor(ctx)), 201));
    this.patch("/api/v1/routes/:id", false, async (ctx) => json(this.routes.update(ctx.params.id!, await ctx.json(), actor(ctx))));
    this.delete("/api/v1/routes/:id", false, (ctx) => json(this.routes.remove(ctx.params.id!, actor(ctx))));
    this.post("/api/v1/routes/reorder", false, async (ctx) => {
      const body = await ctx.json<{ ids: string[] }>();
      return json(this.routes.reorder(body.ids, actor(ctx)));
    });
    this.post("/api/v1/routes/publish", false, async (ctx) => {
      const body = await ctx.json<{ note?: string }>();
      return json(this.routes.publish(body.note ?? "", actor(ctx)));
    });
    this.post("/api/v1/routes/discard", false, (ctx) => json(this.routes.discard(actor(ctx))));
    this.post("/api/v1/routes/rollback/:version", false, (ctx) => json(this.routes.rollback(Number(ctx.params.version), actor(ctx))));
    this.get("/api/v1/rulesets", false, (ctx) => {
      ownerOnly(ctx);
      return json(this.rulesets.state());
    });
    this.post("/api/v1/rulesets/refresh", false, async (ctx) => {
      ownerOnly(ctx);
      return json(await this.rulesets.refresh(true));
    });

    this.get("/api/v1/traffic", false, (ctx) => json(this.traffic.overview(period(ctx.url.searchParams.get("period")), ctx.owner?.timezone)));
    this.get("/api/v1/system", false, async () => {
      await this.monitoring.refreshServices();
      return json(await this.system.state());
    });
    this.get("/api/v1/system/events", false, (ctx) => {
      const scope = journalScope(ctx.url.searchParams.get("scope"));
      const category = journalCategories(ctx.url.searchParams.get("category"));
      const q = ctx.url.searchParams.get("q") ?? undefined;
      const before = optionalPositiveInteger(ctx.url.searchParams.get("before"));
      const limit = optionalPositiveInteger(ctx.url.searchParams.get("limit"));
      return json(this.journal.list({ scope, category, q, before, limit }));
    });
    this.post("/api/v1/engines/reorder", false, async (ctx) => {
      ownerOnly(ctx);
      const body = await ctx.json<{ ids?: unknown }>();
      return json(this.system.updateEngineOrder(body.ids, actor(ctx)));
    });
    this.get("/api/v1/settings", false, () => json(this.system.settings()));
    this.patch("/api/v1/settings", false, async (ctx) => json(this.system.updateSettings(await ctx.json(), actor(ctx))));

    this.get("/api/v1/engines/configurations", false, () => json(this.engineConfigs.state()));
    this.post("/api/v1/engines/configurations/preview", false, async (ctx) => {
      const body = await ctx.json<{ engine: "hysteria" | "xray"; template: string }>();
      return json(this.engineConfigs.preview(engineName(body.engine), engineTemplate(body.template), this.activeCredentials()));
    });
    this.post("/api/v1/engines/configurations/apply", false, async (ctx) => {
      const body = await ctx.json<{ engine: "hysteria" | "xray"; template: string }>();
      return json(await this.engineConfigs.apply(engineName(body.engine), engineTemplate(body.template), this.activeCredentials(), actor(ctx)));
    });
    this.post("/api/v1/engines/configurations/:engine/rollback/:version", false, async (ctx) => {
      return json(await this.engineConfigs.rollback(
        engineName(ctx.params.engine!),
        Number(ctx.params.version),
        this.activeCredentials(),
        actor(ctx),
      ));
    });

    this.get("/api/v1/operations", false, () => json({ operations: this.operations.list() }));
    this.get("/api/v1/operations/events", false, () => this.operationEvents());
    this.get("/api/v1/backups/:name", false, (ctx) => this.backupDownload(ctx.params.name!));
    this.post("/api/v1/operations/preview", false, async (ctx) => {
      const body = await ctx.json<{ action: Parameters<OperationService["preview"]>[0]; payload?: Record<string, unknown> }>();
      return json(this.operations.preview(body.action, body.payload ?? {}, actor(ctx)), 201);
    });
    this.post("/api/v1/operations/confirm", false, async (ctx) => {
      const body = await ctx.json<{
        confirmationId: string;
        action: Parameters<OperationService["confirm"]>[1];
        payload?: Record<string, unknown>;
      }>();
      return json(this.operations.confirm(body.confirmationId, body.action, body.payload ?? {}, actor(ctx)), 202);
    });
    this.post("/api/v1/tokens", false, async (ctx) => {
      const body = await ctx.json<{ name: string; scopes: string[] }>();
      return json(this.auth.createApiToken(body.name, body.scopes, actor(ctx)), 201);
    });
    this.get("/api/v1/tokens", false, () => json({ tokens: this.auth.apiTokens() }));
    this.delete("/api/v1/tokens/:id", false, (ctx) => {
      this.auth.revokeApiToken(ctx.params.id!, actor(ctx));
      return empty();
    });

    this.post("/internal/hysteria/auth", true, async (ctx) => {
      const body = await ctx.json<{ auth?: string }>();
      return json(this.connections.authenticateHysteria(body.auth ?? ""));
    });

    this.get("/s/:token/routes", true, (ctx) => this.linkRoutes(ctx.params.token!));
    this.get("/s/:token", true, (ctx) => this.subscription(ctx));
    this.get("/rulesets/:family/:code", true, (ctx) => this.ruleSet(ctx));
  }

  private subscription(ctx: RequestContext) {
    const token = ctx.params.token!;
    const connection = this.connections.bySubscriptionToken(token);
    const format = subscriptionFormat(ctx.request, ctx.url.searchParams.get("format"));
    if (!format) {
      const baseUrl = `${config.origin}/s/${token}`;
      const platform = detectPlatform(ctx.request.headers.get("user-agent") ?? "");
      return new Response(renderCatalogPage(connection, baseUrl, platform), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
      });
    }
    const credentials = this.connections.credentials(connection.id);
    const rendered = renderers[format].render({
      connection,
      credentials,
      routes: this.routes.published(),
      subscriptionToken: token,
      engineOrder: this.system.engineOrder(),
      clientPlatform: detectPlatform(ctx.request.headers.get("user-agent") ?? ""),
    });
    this.connections.markFetched(connection.id, format);
    return new Response(rendered.body, { headers: { "content-type": rendered.contentType, ...rendered.headers } });
  }

  private linkRoutes(token: string) {
    this.connections.bySubscriptionToken(token);
    const rendered = renderLinkRoutes(this.routes.published());
    const version = this.db.setting("active_route_version", 0);
    return new Response(rendered.body, {
      headers: { "content-type": rendered.contentType, "cache-control": "private, no-store", "x-routes-version": String(version) },
    });
  }

  private ruleSet(ctx: RequestContext) {
    const result = this.rulesets.file(ctx.params.family!, ctx.params.code!);
    if (ctx.request.headers.get("if-none-match") === result.etag) {
      return new Response(null, {
        status: 304,
        headers: { etag: result.etag, "cache-control": "public, max-age=86400, stale-if-error=604800" },
      });
    }
    return new Response(result.file, {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "public, max-age=86400, stale-if-error=604800",
        etag: result.etag,
        "x-ruleset-version": result.version,
      },
    });
  }

  private operationEvents() {
    let unsubscribe = () => {};
    let timer: ReturnType<typeof setInterval>;
    const stream = new ReadableStream({
      start: (controller) => {
        const push = (event: unknown) => controller.enqueue(`event: operation\ndata: ${JSON.stringify(event)}\n\n`);
        unsubscribe = this.operations.subscribe(push);
        controller.enqueue(`event: ready\ndata: {}\n\n`);
        timer = setInterval(() => controller.enqueue(": keepalive\n\n"), 15_000);
      },
      cancel: () => {
        unsubscribe();
        clearInterval(timer);
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
  }

  private backupDownload(name: string) {
    if (!/^outpost-[0-9a-f-]+\.(age|tar)$/.test(name)) throw new ServiceError(404, "Резервная копия не найдена");
    const path = `${config.dataDir}/backups/${name}`;
    const file = Bun.file(path);
    if (!file.size) throw new ServiceError(404, "Резервная копия не найдена");
    return new Response(file, {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "private, no-store",
      },
    });
  }

  private async staticResponse(url: URL) {
    if (url.pathname === "/") return coverPage();
    if (url.pathname === config.adminPath) return Response.redirect(`${config.origin}${config.adminPath}/`, 302);
    if (url.pathname.startsWith(`${config.adminPath}/`)) return fileResponse(`${config.webRoot}/index.html`);
    const safePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (safePath.includes("..")) throw new ServiceError(400, "Некорректный путь");
    const file = Bun.file(`${config.webRoot}/${safePath}`);
    if (await file.exists()) return new Response(file);
    return new Response("Not found", { status: 404 });
  }

  private async connectionResult(result: ReturnType<ConnectionSyncService["connection"]>) {
    if (!result.subscription) return { ...result, connection: publicConnection(result.connection), catalogVersion, applications: [] };
    const qrDataUrl = await QRCode.toDataURL(result.subscription.url, { margin: 1, width: 320, errorCorrectionLevel: "M" });
    const formats = Object.fromEntries(await Promise.all(
      Object.entries(result.subscription.formats).map(async ([format, url]) => [
        format,
        { url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: "M" }) },
      ]),
    ));
    return {
      ...result,
      connection: publicConnection(result.connection),
      subscription: { ...result.subscription, qrDataUrl, formats },
      catalogVersion,
      applications: catalog(result.subscription.url),
    };
  }

  private activeCredentials() {
    return this.connections.activeCredentials();
  }

  private route(method: string, path: string, isPublic: boolean, handler: Handler) {
    this.registry.push({ method, pattern: new URLPattern({ pathname: path }), public: isPublic, handler });
  }

  private get(path: string, isPublic: boolean, handler: Handler) { this.route("GET", path, isPublic, handler); }
  private post(path: string, isPublic: boolean, handler: Handler) { this.route("POST", path, isPublic, handler); }
  private patch(path: string, isPublic: boolean, handler: Handler) { this.route("PATCH", path, isPublic, handler); }
  private delete(path: string, isPublic: boolean, handler: Handler) { this.route("DELETE", path, isPublic, handler); }
}

function publicConnection<T extends { presence?: { status?: unknown } }>(connection: T) {
  const { presence, ...visible } = connection;
  return { ...visible, presence: presence?.status ?? "unknown" };
}

function publicConnections<T extends { presence?: { status?: unknown } }>(connections: T[]) {
  return connections.map(publicConnection);
}

function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, { status, headers });
}

function empty() { return new Response(null, { status: 204 }); }

async function readJson(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 1024 * 1024) throw new ServiceError(413, "Запрос слишком большой");
  try { return await request.json(); } catch { throw new ServiceError(400, "Ожидался корректный JSON"); }
}

function errorResponse(error: unknown, requestId: string) {
  if (error instanceof ServiceError) return json({ error: { message: error.message, details: error.details, requestId } }, error.status);
  if (error instanceof ZodError) return json({ error: { message: "Проверьте введённые данные", details: error.issues, requestId } }, 400);
  console.error(`[${requestId}]`, error);
  return json({ error: { message: "Внутренняя ошибка", requestId } }, 500);
}

function secure(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  // Imba emits component CSS into runtime <style> elements. Scripts remain external-only.
  headers.set("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function cookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function sessionResponse(session: { token: string; expiresAt: string }) {
  return json({ ok: true, expiresAt: session.expiresAt }, 200, { "set-cookie": sessionCookie(session.token, session.expiresAt) });
}

function sessionCookie(token: string, expiresAt: string) {
  const secure = config.origin.startsWith("https://") ? "; Secure" : "";
  return `outpost_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

function expiredSessionCookie() {
  return "outpost_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
}

function canonicalDemoUrl(request: Request, url: URL) {
  if (!config.demo || request.method !== "GET" || url.hostname !== "127.0.0.1") return null;
  const isAdminPage = url.pathname === config.adminPath || url.pathname.startsWith(`${config.adminPath}/`);
  if (!isAdminPage || !request.headers.get("accept")?.includes("text/html")) return null;
  const target = new URL(url);
  target.hostname = "localhost";
  return target;
}

function actor(ctx: RequestContext) { return ctx.owner?.id ?? "anonymous"; }

function ownerOnly(ctx: RequestContext) {
  if (!ctx.owner || ctx.owner.scopes) throw new ServiceError(403, "Действие доступно только владельцу панели");
}

function authorized(method: string, path: string, scopes: string[]) {
  if (scopes.includes("*")) return true;
  const read = method === "GET";
  const required = path === "/api/v1/status" ? "status:read"
    : path === "/api/v1/dashboard" ? "owner:session"
    : path.startsWith("/api/v1/me") ? `settings:${read ? "read" : "write"}`
    : path.startsWith("/api/v1/connections") ? `connections:${read ? "read" : "write"}`
      : path.startsWith("/api/v1/routes") ? `routes:${read ? "read" : "write"}`
        : path.startsWith("/api/v1/rulesets") ? `routes:${read ? "read" : "write"}`
        : path.startsWith("/api/v1/traffic") ? "traffic:read"
          : path.startsWith("/api/v1/backups") ? "backups:read"
          : path.startsWith("/api/v1/operations") ? `operations:${read ? "read" : "write"}`
            : path.startsWith("/api/v1/settings") ? `settings:${read ? "read" : "write"}`
              : path.startsWith("/api/v1/engines") ? `engines:${read ? "read" : "write"}`
              : path.startsWith("/api/v1/tokens") ? "tokens:write"
                : path.startsWith("/api/v1/system") ? "system:read"
                  : "api:read";
  return scopes.includes(required) || (read && scopes.includes("read")) || (!read && scopes.includes("write"));
}

function period(value: string | null): TrafficPeriod {
  const periods: TrafficPeriod[] = ["today", "24h", "week", "7d", "month", "30d", "year", "365d", "all"];
  return periods.includes(value as TrafficPeriod) ? value as TrafficPeriod : "30d";
}

function journalScope(value: string | null): JournalScope {
  const scopes: JournalScope[] = ["all", "important", "errors", "changes"];
  return scopes.includes(value as JournalScope) ? value as JournalScope : "all";
}

function journalCategories(value: string | null): JournalCategory[] | undefined {
  const categories: JournalCategory[] = ["connections", "routes", "engines", "maintenance", "security", "system"];
  const selected = (value ?? "").split(",").filter((item) => categories.includes(item as JournalCategory)) as JournalCategory[];
  return selected.length ? [...new Set(selected)] : undefined;
}

function optionalPositiveInteger(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function subscriptionFormat(request: Request, requested: string | null): SubscriptionFormat | null {
  const formats: SubscriptionFormat[] = ["mihomo", "sing-box", "xray", "xray-json", "links"];
  if (requested) {
    if (!formats.includes(requested as SubscriptionFormat)) throw new ServiceError(404, "Формат подписки не поддерживается");
    return requested as SubscriptionFormat;
  }
  const agent = (request.headers.get("user-agent") ?? "").toLowerCase();
  if (/mihomo|clash|everywhere|flclash/.test(agent)) return "mihomo";
  if (/sing-box|singbox|sfa|sfi|sfm/.test(agent)) return "sing-box";
  if (/incy/.test(agent)) return "links";
  if (/xray|v2ray|happ|foxray|streisand/.test(agent)) return "xray";
  if ((request.headers.get("accept") ?? "").includes("text/html")) return null;
  return "xray";
}

function engineName(value: string) {
  if (value !== "hysteria" && value !== "xray") throw new ServiceError(404, "Движок не найден");
  return value;
}

function engineTemplate(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 256_000) {
    throw new ServiceError(400, "Шаблон конфигурации пуст или слишком велик");
  }
  return value;
}

async function fileResponse(path: string) {
  const file = Bun.file(path);
  if (!await file.exists()) return new Response("Frontend is not built", { status: 503 });
  return new Response(file);
}

function coverPage() {
  return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Сервис</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui;color:#344054;background:#f7f9fc}.box{text-align:center}.dot{width:10px;height:10px;border-radius:50%;background:#16a34a;display:inline-block;margin-right:8px}</style></head><body><div class="box"><p><span class="dot"></span>Сервис работает</p></div></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}
