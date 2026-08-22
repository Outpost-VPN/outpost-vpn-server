import { ZodError } from "zod";
import QRCode from "qrcode";
import { chmod, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";
import type { OutpostDatabase } from "./db/database";
import { AuthService } from "./auth/webauthn";
import { renderLinkRoutes, renderers } from "./adapters/subscriptions";
import {
  advanced,
  advancedDefinition,
  application,
  catalog,
  catalogVersion,
  detectPlatform,
  renderCatalogPage,
} from "./adapters/catalog";
import { ConnectionService, ServiceError } from "./services/connections";
import { RouteService } from "./services/routes";
import { TrafficService, configuredCollectors, type TrafficPeriod } from "./services/traffic";
import { OperationService } from "./services/operations";
import { SystemService } from "./services/system";
import { EngineRuntimeService } from "./services/engine-runtime";
import { EngineConfigService } from "./adapters/engines";
import { JournalService, type JournalScope } from "./services/journal";
import type { JournalCategory, SubscriptionFormat } from "./models";
import { MonitoringService, prepareSetupMonitoring } from "./services/monitoring";
import { ConnectionSyncService } from "./services/connection-sync";
import { SetupService } from "./services/setup";
import { RuleSetService } from "./services/rulesets";
import { DashboardEvents, type DashboardReason } from "./services/dashboard-events";
import { metadata, type Locale } from "../shared/i18n";
import { errorCode, languageCookie, localize, localizePresentation, requestLanguage } from "./i18n";

type Owner = { id: string; timezone: string; language: Locale; scopes?: string[] };
type Handler = (context: RequestContext) => Response | Promise<Response>;

type RequestContext = {
  request: Request;
  url: URL;
  params: Record<string, string>;
  owner: Owner | null;
  language: Locale;
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
  readonly dashboardEvents: DashboardEvents;
  private registry: Route[] = [];

  constructor(
    readonly db: OutpostDatabase,
    connectionEngine?: Pick<EngineRuntimeService, "add" | "rotate" | "revoke">,
  ) {
    if (config.setup) prepareSetupMonitoring(db);
    this.dashboardEvents = new DashboardEvents();
    this.journal = new JournalService(db);
    this.auth = new AuthService(db, this.journal);
    this.setup = new SetupService(this.auth);
    this.connections = new ConnectionService(db, this.journal);
    this.rulesets = new RuleSetService(db, this.journal);
    this.routes = new RouteService(db, this.journal, this.rulesets);
    this.traffic = new TrafficService(db, configuredCollectors(), this.journal, !config.setup);
    this.engines = new EngineRuntimeService(db);
    this.connectionSync = new ConnectionSyncService(db, this.connections, connectionEngine ?? this.engines);
    this.engineConfigs = new EngineConfigService(db, this.journal);
    this.operations = new OperationService(db, this.journal, undefined, async (connectionId, operationActor) => {
      const result = await this.connectionSync.rotate(connectionId, operationActor);
      if (result.state !== "ready") throw new Error(result.error ?? "Не удалось перевыпустить подключение");
      return { ok: true, connectionId, generation: result.connection.generation };
    });
    this.system = new SystemService(db, this.journal);
    this.monitoring = new MonitoringService(db, this.journal, undefined, undefined, { setup: config.setup });
    this.operations.subscribe(() => this.dashboardEvents.publish("operations"));
    this.registerRoutes();
  }

  async collectTraffic() {
    await this.traffic.collect();
    return this.dashboardEvents.publish("traffic");
  }

  async collectMonitoring() {
    await this.monitoring.collect();
    return this.dashboardEvents.publish("monitoring");
  }

  async syncConnections() {
    const result = await this.connectionSync.drain();
    if (result.processed) this.dashboardEvents.publish("connections");
    return result;
  }

  async refreshRulesets() {
    const before = JSON.stringify(this.rulesets.state());
    const after = await this.rulesets.refresh();
    if (JSON.stringify(after) !== before) this.dashboardEvents.publish("rulesets");
    return after;
  }

  async checkUpdates() {
    const before = JSON.stringify(this.system.updates.state());
    const after = await this.system.updates.refresh();
    if (JSON.stringify(after) !== before) this.dashboardEvents.publish("updates");
    return after;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    let language = requestLanguage(request, url);
    const previewUrl = canonicalDemoUrl(request, url);
    if (previewUrl) return secure(Response.redirect(previewUrl, 302), requestId, language);
    try {
      const endpoint = this.registry.find((route) => route.method === request.method && route.pattern.test(url));
      if (endpoint) {
        const result = endpoint.pattern.exec(url);
        const params = Object.fromEntries(Object.entries(result?.pathname.groups ?? {}).map(([key, value]) => [key, value ?? ""]));
        const owner = this.auth.authenticate(cookie(request, "outpost_session"), request.headers.get("authorization") ?? undefined);
        language = requestLanguage(request, url, owner);
        if (!endpoint.public && !owner) throw new ServiceError(401, "Сессия истекла — войдите снова");
        if (!endpoint.public && owner && "scopes" in owner && !authorized(request.method, url.pathname, owner.scopes)) {
          throw new ServiceError(403, "API token не имеет нужного scope");
        }
        const response = await endpoint.handler({
          request,
          url,
          params,
          owner,
          language,
          json: () => readJson(request),
        });
        const reason = dashboardMutation(request.method, url.pathname, endpoint.public, response.status);
        if (reason) this.dashboardEvents.publish(reason);
        return secure(response, requestId, language);
      }
      return secure(await this.staticResponse(request, url, language), requestId, language);
    } catch (error) {
      const response = errorResponse(error, requestId, language);
      return secure(response, requestId, language);
    }
  }

  private registerRoutes() {
    this.get("/healthz", true, () => json({ ok: true, version: config.version }));
    this.get("/readyz", true, () => json({ ok: true, database: true }));

    this.get("/api/v1/auth/state", true, () => json(this.auth.state()));
    this.get("/api/v1/setup", true, () => json(this.setup.state()));
    this.post("/api/v1/setup/domain", true, async (ctx) => json(await this.setup.finalize(await ctx.json())));
    this.post("/api/v1/setup/restore", true, async (ctx) => this.restoreBackup(ctx.request));
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
      const operations = localizePresentation(this.operations.list().slice(0, 5), ctx.language);
      const system = localizePresentation(await this.system.state(), ctx.language);
      return json({
        revision: this.dashboardEvents.revision,
        auth: this.auth.state(),
        connections: publicConnections(this.connections.list()),
        routes: this.routes.state(),
        traffic: this.traffic.overview(period(ctx.url.searchParams.get("period")), ctx.owner?.timezone),
        system,
        settings: this.system.settings(),
        engineConfigs: this.engineConfigs.state(),
        tokens: this.auth.apiTokens(),
        operations,
        security: this.auth.security(cookie(ctx.request, "outpost_session")),
      });
    });
    this.get("/api/v1/dashboard/events", false, (ctx) => {
      ownerOnly(ctx);
      return this.dashboardEventStream();
    });

    this.get("/api/v1/connections", false, () => json({ connections: publicConnections(this.connections.list()) }));
    this.post("/api/v1/connections", false, async (ctx) => {
      const created = this.connections.create(await ctx.json(), actor(ctx));
      const state = await this.connectionSync.activate(created.id);
      return json(await this.connectionResult(state, ctx.language), state.state === "ready" ? 201 : 202);
    });
    this.get("/api/v1/connections/:id", false, (ctx) => json(publicConnection(this.connections.get(ctx.params.id!))));
    this.patch("/api/v1/connections/:id", false, async (ctx) => {
      return json(publicConnection(this.connections.update(ctx.params.id!, await ctx.json(), actor(ctx))));
    });
    this.delete("/api/v1/connections/:id", false, async (ctx) => {
      ownerOnly(ctx);
      return json(await this.connectionResult(await this.connectionSync.archive(ctx.params.id!, actor(ctx)), ctx.language), 202);
    });
    this.get("/api/v1/connections/:id/subscription", false, async (ctx) => {
      return json(await this.connectionResult(this.connectionSync.connection(ctx.params.id!), ctx.language));
    });
    this.post("/api/v1/connections/:id/retry", false, async (ctx) => {
      const state = await this.connectionSync.retry(ctx.params.id!);
      return json(await this.connectionResult(state, ctx.language), state.state === "ready" ? 200 : 202);
    });
    this.post("/api/v1/connections/:id/rotate", false, async (ctx) => {
      ownerOnly(ctx);
      const state = await this.connectionSync.rotate(ctx.params.id!, actor(ctx));
      return json(await this.connectionResult(state, ctx.language), state.state === "ready" ? 200 : 202);
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
    this.get("/api/v1/system", false, async (ctx) => {
      await this.monitoring.refreshServices();
      return json(localizePresentation(await this.system.state(), ctx.language));
    });
    this.get("/api/v1/system/events", false, (ctx) => {
      const scope = journalScope(ctx.url.searchParams.get("scope"));
      const category = journalCategories(ctx.url.searchParams.get("category"));
      const q = ctx.url.searchParams.get("q") ?? undefined;
      const before = optionalPositiveInteger(ctx.url.searchParams.get("before"));
      const limit = optionalPositiveInteger(ctx.url.searchParams.get("limit"));
      return json(this.journal.list({ scope, category, q, before, limit, language: ctx.language }));
    });
    this.post("/api/v1/engines/reorder", false, async (ctx) => {
      ownerOnly(ctx);
      const body = await ctx.json<{ ids?: unknown }>();
      return json(this.system.updateEngineOrder(body.ids, actor(ctx)));
    });
    this.get("/api/v1/settings", false, () => json(this.system.settings()));
    this.patch("/api/v1/settings", false, async (ctx) => json(this.system.updateSettings(await ctx.json(), actor(ctx))));
    this.post("/api/v1/updates/check", false, async (ctx) => {
      ownerOnly(ctx);
      return json(await this.system.updates.check(actor(ctx)));
    });
    this.post("/api/v1/updates/prepare", false, async (ctx) => {
      ownerOnly(ctx);
      return json(await this.system.updates.prepare(actor(ctx)));
    });

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

    this.get("/api/v1/operations", false, (ctx) => json({ operations: localizePresentation(this.operations.list(), ctx.language) }));
    this.get("/api/v1/operations/events", false, (ctx) => this.operationEvents(ctx.language));
    this.get("/api/v1/backups/:name", false, (ctx) => this.backupDownload(ctx.params.name!));
    this.post("/api/v1/operations/preview", false, async (ctx) => {
      const body = await ctx.json<{ action: Parameters<OperationService["preview"]>[0]; payload?: Record<string, unknown> }>();
      if (body.action === "connection.rotate") requireApiScope(ctx, "connections:rotate");
      return json(localizePresentation(this.operations.preview(body.action, body.payload ?? {}, actor(ctx)), ctx.language), 201);
    });
    this.post("/api/v1/operations/confirm", false, async (ctx) => {
      const body = await ctx.json<{
        confirmationId: string;
        action: Parameters<OperationService["confirm"]>[1];
        payload?: Record<string, unknown>;
      }>();
      if (body.action === "connection.rotate") requireApiScope(ctx, "connections:rotate");
      return json(localizePresentation(this.operations.confirm(body.confirmationId, body.action, body.payload ?? {}, actor(ctx)), ctx.language), 202);
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

    this.get("/s/:token/routes", true, (ctx) => this.linkRoutes(ctx));
    this.head("/s/:token/routes", true, (ctx) => this.linkRoutes(ctx, true));
    this.get("/s/:token/apps/:appId", true, (ctx) => this.applicationProfile(ctx));
    this.head("/s/:token/apps/:appId", true, (ctx) => this.applicationProfile(ctx, true));
    this.get("/s/:token/advanced/:target", true, (ctx) => this.advancedProfile(ctx));
    this.head("/s/:token/advanced/:target", true, (ctx) => this.advancedProfile(ctx, true));
    this.get("/s/:token/qr/:target", true, (ctx) => this.subscriptionQr(ctx));
    this.head("/s/:token/qr/:target", true, (ctx) => this.subscriptionQr(ctx, true));
    this.get("/s/:token", true, (ctx) => this.subscription(ctx));
    this.head("/s/:token", true, (ctx) => this.subscription(ctx, true));
    this.get("/rulesets/:family/:code", true, (ctx) => this.ruleSet(ctx));
  }

  private async subscription(ctx: RequestContext, head = false) {
    const token = ctx.params.token!;
    const connection = this.connections.bySubscriptionToken(token);
    if (ctx.url.searchParams.has("format")) {
      return new Response(head ? null : "Legacy format URLs are gone", {
        status: 410,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
      });
    }
    const requestedPlatform = ctx.url.searchParams.get("platform");
    if (!requestedPlatform) {
      const format = universalSubscriptionFormat(ctx.request);
      if (format) return this.profile(ctx, format, head);
    }
    const baseUrl = `${config.origin}/s/${token}`;
    const platform = requestedPlatform ?? detectPlatform(ctx.request.headers.get("user-agent") ?? "");
    const html = renderCatalogPage(connection, baseUrl, platform, ctx.language);
    return contentResponse(ctx.request, html, "text/html; charset=utf-8", head);
  }

  private async applicationProfile(ctx: RequestContext, head = false) {
    const item = application(ctx.params.appId!);
    if (!item) throw new ServiceError(404, "Приложение не найдено");
    return this.profile(ctx, item.format, head, item.id);
  }

  private async advancedProfile(ctx: RequestContext, head = false) {
    const item = advancedDefinition(ctx.params.target!);
    if (!item) throw new ServiceError(404, "Профиль не найден");
    return this.profile(ctx, item.format, head);
  }

  private async profile(ctx: RequestContext, format: SubscriptionFormat, head: boolean, appId?: string) {
    const token = ctx.params.token!;
    const connection = this.connections.bySubscriptionToken(token);
    const credentials = this.connections.credentials(connection.id);
    const rendered = renderers[format].render({
      connection,
      credentials,
      routes: this.routes.published(),
      subscriptionToken: token,
      engineOrder: this.system.engineOrder(),
      clientPlatform: detectPlatform(ctx.request.headers.get("user-agent") ?? ""),
    });
    const body = appId === "stash"
      ? `#SUBSCRIBED ${config.origin}/s/${token}/apps/stash\n${rendered.body}`
      : rendered.body;
    const response = await contentResponse(ctx.request, body, rendered.contentType, head, rendered.headers);
    if (!head && response.status === 200) this.connections.markFetched(connection.id);
    return response;
  }

  private async subscriptionQr(ctx: RequestContext, head = false) {
    const token = ctx.params.token!;
    this.connections.bySubscriptionToken(token);
    const target = ctx.params.target!;
    if (!target.endsWith(".svg")) throw new ServiceError(404, "QR-код не найден");
    const id = target.slice(0, -4);
    const baseUrl = `${config.origin}/s/${token}`;
    let value = baseUrl;
    if (id !== "landing") {
      const item = application(id);
      if (!item) throw new ServiceError(404, "QR-код не найден");
      const profileUrl = `${baseUrl}/apps/${item.id}`;
      value = item.deepLink?.(profileUrl) ?? profileUrl;
    }
    const svg = await QRCode.toString(value, { type: "svg", margin: 1, width: 320, errorCorrectionLevel: "M" });
    return contentResponse(ctx.request, svg, "image/svg+xml; charset=utf-8", head);
  }

  private async linkRoutes(ctx: RequestContext, head = false) {
    const token = ctx.params.token!;
    this.connections.bySubscriptionToken(token);
    const rendered = renderLinkRoutes(this.routes.published());
    const version = this.db.setting("active_route_version", 0);
    return contentResponse(ctx.request, rendered.body, rendered.contentType, head, { "x-routes-version": String(version) });
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

  private operationEvents(language: Locale) {
    let unsubscribe = () => {};
    let timer: ReturnType<typeof setInterval>;
    const stream = new ReadableStream({
      start: (controller) => {
        const push = (event: unknown) => controller.enqueue(`event: operation\ndata: ${JSON.stringify(localizePresentation(event, language))}\n\n`);
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

  private dashboardEventStream() {
    let unsubscribe = () => {};
    let timer: ReturnType<typeof setInterval> | undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start: (controller) => {
        const push = (event: ReturnType<DashboardEvents["publish"]>) => {
          controller.enqueue(encoder.encode(`id: ${event.revision}\nevent: snapshot\ndata: ${JSON.stringify(event)}\n\n`));
        };
        unsubscribe = this.dashboardEvents.subscribe(push);
        controller.enqueue(encoder.encode(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ revision: this.dashboardEvents.revision, at: new Date().toISOString() })}\n\n`));
        timer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ revision: this.dashboardEvents.revision, at: new Date().toISOString() })}\n\n`));
          } catch {
            unsubscribe();
            if (timer) clearInterval(timer);
          }
        }, 15_000);
      },
      cancel: () => {
        unsubscribe();
        if (timer) clearInterval(timer);
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
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

  private async restoreBackup(request: Request) {
    const limit = 256 * 1024 * 1024;
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > limit) throw new ServiceError(413, "Резервная копия слишком большая");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ServiceError(400, "Не удалось прочитать резервную копию");
    }
    const archive = form.get("archive");
    const claimToken = form.get("claimToken");
    const passphrase = form.get("passphrase");
    if (!(archive instanceof File) || !archive.size) throw new ServiceError(400, "Выберите резервную копию Outpost");
    if (archive.size > limit) throw new ServiceError(413, "Резервная копия слишком большая");
    if (typeof claimToken !== "string" || !claimToken) throw new ServiceError(401, "Продолжение первоначальной настройки недействительно или истекло");
    const extension = archive.name.toLowerCase().endsWith(".age") ? "age"
      : archive.name.toLowerCase().endsWith(".tar") ? "tar" : null;
    if (!extension) throw new ServiceError(400, "Выберите файл Outpost в формате .age или .tar");
    const password = typeof passphrase === "string" && passphrase ? passphrase : undefined;
    if (extension === "age" && (!password || password.length < 12 || password.length > 200)) {
      throw new ServiceError(400, "Введите пароль резервной копии");
    }
    const restoreId = crypto.randomUUID();
    const directory = join(config.dataDir, "incoming");
    const path = join(directory, `restore-${restoreId}.${extension}`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await Bun.write(path, archive);
    await chmod(path, 0o600);
    try {
      const result = await this.setup.restore({ claimToken, archive: path, restoreId, passphrase: password });
      return json(result, 202);
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  private async staticResponse(request: Request, url: URL, language: Locale) {
    const surface = request.headers.get("x-outpost-surface") === "setup" ? "setup" : "admin";
    if (url.pathname === "/setup" || url.pathname.startsWith("/setup/")
      || url.pathname === `${config.adminPath}/setup` || url.pathname.startsWith(`${config.adminPath}/setup/`)) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/") {
      return surface === "setup"
        ? indexResponse(`${config.webRoot}/index.html`, language, surface)
        : coverPage(language);
    }
    if (url.pathname === config.adminPath) return Response.redirect(`${config.origin}${config.adminPath}/`, 302);
    if (url.pathname.startsWith(`${config.adminPath}/`)) return indexResponse(`${config.webRoot}/index.html`, language, "admin");
    const safePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (safePath.includes("..")) throw new ServiceError(400, "Некорректный путь");
    const file = Bun.file(`${config.webRoot}/${safePath}`);
    if (await file.exists()) {
      const versioned = url.searchParams.get("v") === config.version;
      const cache = config.production && versioned
        ? "public, max-age=31536000, immutable"
        : "no-cache";
      return new Response(file, { headers: { "cache-control": cache } });
    }
    return new Response("Not found", { status: 404 });
  }

  private async connectionResult(result: ReturnType<ConnectionSyncService["connection"]>, language: Locale) {
    if (!result.subscription) return { ...result, connection: publicConnection(result.connection), catalogVersion, applications: [], advanced: [] };
    return {
      ...result,
      connection: publicConnection(result.connection),
      subscription: { ...result.subscription, qrUrl: `${result.subscription.url}/qr/landing.svg` },
      catalogVersion,
      applications: catalog(result.subscription.url, undefined, language),
      advanced: advanced(result.subscription.url, language),
    };
  }

  private activeCredentials() {
    return this.connections.activeCredentials();
  }

  private route(method: string, path: string, isPublic: boolean, handler: Handler) {
    this.registry.push({ method, pattern: new URLPattern({ pathname: path }), public: isPublic, handler });
  }

  private get(path: string, isPublic: boolean, handler: Handler) { this.route("GET", path, isPublic, handler); }
  private head(path: string, isPublic: boolean, handler: Handler) { this.route("HEAD", path, isPublic, handler); }
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

function universalSubscriptionFormat(request: Request): SubscriptionFormat | null {
  const agent = (request.headers.get("user-agent") ?? "").toLowerCase();
  if (/mihomo|clash|everywhere|flclash|stash/.test(agent)) return "mihomo";
  if (/sing-box|singbox|sfa|sfi|sfm/.test(agent)) return "sing-box";
  if (/incy/.test(agent)) return "links";
  if (/xray|v2ray|happ|foxray|streisand/.test(agent)) return "xray";
  if ((request.headers.get("accept") ?? "").includes("text/html")) return null;
  return "xray";
}

async function contentResponse(
  request: Request,
  body: string,
  contentType: string,
  head = false,
  extra: HeadersInit = {},
) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const tag = `"${Buffer.from(digest).toString("base64url")}"`;
  const headers = new Headers(extra);
  headers.set("content-type", contentType);
  headers.set("cache-control", "private, no-store");
  headers.set("etag", tag);
  if ((request.headers.get("if-none-match") ?? "").split(",").map((item) => item.trim()).includes(tag)) {
    return new Response(null, { status: 304, headers });
  }
  headers.set("content-length", String(Buffer.byteLength(body)));
  return new Response(head ? null : body, { headers });
}

async function readJson(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 1024 * 1024) throw new ServiceError(413, "Запрос слишком большой");
  try { return await request.json(); } catch { throw new ServiceError(400, "Ожидался корректный JSON"); }
}

function errorResponse(error: unknown, requestId: string, language: Locale) {
  if (error instanceof ServiceError) return json({
    code: errorCode(error.message, error.status),
    message: localize(error.message, language),
    details: error.details,
    requestId,
  }, error.status);
  if (error instanceof ZodError) return json({
    code: "validation.invalid",
    message: localize("Проверьте введённые данные", language),
    details: error.issues,
    requestId,
  }, 400);
  console.error(`[${requestId}]`, error);
  return json({ code: "internal.error", message: localize("Внутренняя ошибка", language), requestId }, 500);
}

function secure(response: Response, requestId: string, language: Locale) {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  headers.set("content-language", language);
  headers.append("set-cookie", languageCookie(language));
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

function requireApiScope(ctx: RequestContext, scope: string) {
  if (ctx.owner?.scopes && !ctx.owner.scopes.includes("*") && !ctx.owner.scopes.includes(scope)) {
    throw new ServiceError(403, "API token не имеет нужного scope");
  }
}

function authorized(method: string, path: string, scopes: string[]) {
  if (scopes.includes("*")) return true;
  if (/^\/api\/v1\/connections\/[^/]+\/subscription$/.test(path)) return scopes.includes("connections:secret");
  if (/^\/api\/v1\/connections\/[^/]+\/rotate$/.test(path)) return scopes.includes("connections:rotate");
  const read = method === "GET";
  const required = path === "/api/v1/status" ? "status:read"
    : path.startsWith("/api/v1/dashboard") ? "owner:session"
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

async function indexResponse(path: string, language: Locale, surface: "admin" | "setup") {
  const file = Bun.file(path);
  if (!await file.exists()) return new Response("Frontend is not built", { status: 503 });
  const meta = metadata(language);
  const html = (await file.text())
    .replaceAll("__OUTPOST_VERSION__", encodeURIComponent(config.version))
    .replaceAll("__OUTPOST_SURFACE__", surface)
    .replace(/<html[^>]*>/, `<html lang="${language}" dir="${meta.direction}">`);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

function dashboardMutation(method: string, path: string, isPublic: boolean, status: number): DashboardReason | null {
  if (isPublic || method === "GET" || status >= 400 || path === "/api/v1/operations/preview") return null;
  if (path.startsWith("/api/v1/rulesets")) return "rulesets";
  return "mutation";
}

function coverPage(language: Locale) {
  const meta = metadata(language);
  const copy = language === "ru" ? { title: "Сервис", status: "Сервис работает" }
    : language === "zh-CN" ? { title: "服务", status: "服务正在运行" }
      : language === "fa" ? { title: "سرویس", status: "سرویس در حال اجرا است" }
        : { title: "Service", status: "Service is running" };
  const labels: Record<Locale, string> = { ru: "Русский", en: "English", "zh-CN": "简体中文", fa: "فارسی" };
  const switcher = (["ru", "en", "zh-CN", "fa"] as Locale[]).map((item) =>
    `<a href="/?lang=${encodeURIComponent(item)}" lang="${item}"${item === language ? ' aria-current="true"' : ""}>${labels[item]}</a>`,
  ).join("");
  return new Response(`<!doctype html><html lang="${language}" dir="${meta.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${copy.title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui;color:#344054;background:#f7f9fc}.box{text-align:center}.dot{width:10px;height:10px;border-radius:50%;background:#16a34a;display:inline-block;margin-inline-end:8px}nav{position:fixed;inset-block-start:18px;inset-inline-end:22px;display:flex;gap:4px;direction:ltr}nav a{padding:6px 8px;border-radius:7px;color:#667085;font-size:12px;text-decoration:none}nav a[aria-current=true]{background:#e8f0ff;color:#075bea;font-weight:700}</style></head><body><nav aria-label="Language">${switcher}</nav><div class="box"><p><span class="dot"></span>${copy.status}</p></div></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}
