import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HttpApplication } from "../src/server/http";
import { createToken, hashToken } from "../src/server/security";
import { database } from "./helpers";

describe("HTTP API", () => {
  let fixture: ReturnType<typeof database>;
  let app: HttpApplication;

  beforeEach(() => {
    fixture = database();
    app = new HttpApplication(fixture.db, {
      async add() { return { ok: true }; },
      async rotate() { return { ok: true }; },
      async revoke() { return { ok: true }; },
    });
  });
  afterEach(() => fixture.close());

  function ownerCookie() {
    const timestamp = new Date().toISOString();
    fixture.db.raw.query("INSERT INTO owners (id, timezone, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("owner", "Europe/Moscow", timestamp, timestamp);
    const token = createToken();
    fixture.db.raw.query(`
      INSERT INTO sessions (id, owner_id, token_hash, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("session", "owner", hashToken(token), new Date(Date.now() + 86_400_000).toISOString(), timestamp, timestamp);
    return `outpost_session=${token}`;
  }

  function request(path: string, cookie: string, method = "GET", body?: unknown) {
    return app.fetch(new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
  }

  function tokenRequest(path: string, token: string, method = "GET", body?: unknown) {
    return app.fetch(new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
  }

  test("public health endpoints are available and protected endpoints require a session", async () => {
    const health = await app.fetch(new Request("http://localhost/healthz"));
    const connections = await app.fetch(new Request("http://localhost/api/v1/connections"));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true });
    expect(health.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(connections.status).toBe(401);
  });

  test("selects setup only for the forced IP surface and removes legacy setup pages", async () => {
    const ordinary = await app.fetch(new Request("http://localhost/"));
    const ipRoot = await app.fetch(new Request("http://localhost/", {
      headers: { "x-outpost-surface": "setup" },
    }));
    const state = await app.fetch(new Request("http://localhost/api/v1/setup"));
    const legacySetup = await app.fetch(new Request("http://localhost/setup"));
    const legacyAdminSetup = await app.fetch(new Request("http://localhost/admin/setup"));

    expect(await ordinary.text()).toContain("Service is running");
    expect(await ipRoot.text()).toContain('name="outpost-surface" content="setup"');
    expect(await state.json()).toEqual({ status: "configured" });
    expect(legacySetup.status).toBe(404);
    expect(legacyAdminSetup.status).toBe(404);
  });

  test("normalizes, deduplicates and deletes legacy-invalid routes", async () => {
    const cookie = ownerCookie();
    const created = await request("/api/v1/routes", cookie, "POST", {
      action: "DIRECT", matcher: "SUFFIX", value: ".RU", enabled: true,
    });
    expect(created.status).toBe(201);
    expect((await created.clone().json()).draft).toContainEqual(expect.objectContaining({ matcher: "SUFFIX", value: "ru" }));

    const duplicate = await request("/api/v1/routes", cookie, "POST", {
      action: "BLOCK", matcher: "SUFFIX", value: "ru", enabled: true,
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: "route.duplicate",
      message: "A rule with this condition already exists.",
    });

    const invalid = await request("/api/v1/routes", cookie, "POST", {
      action: "DIRECT", matcher: "DOMAIN", value: ".ru", enabled: true,
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      code: "route.domain_invalid",
      message: "Enter a complete domain such as example.com.",
    });

    const domain = await request("/api/v1/routes", cookie, "POST", {
      action: "DIRECT", matcher: "DOMAIN", value: "example.com", enabled: true,
    });
    const state = await domain.json();
    const id = state.draft.find((rule: { value: string }) => rule.value === "example.com").id;
    fixture.db.raw.query("UPDATE route_drafts SET matcher = 'GEOSITE', value = 'domain: ru' WHERE id = ?").run(id);

    const removed = await request(`/api/v1/routes/${id}`, cookie, "DELETE");
    expect(removed.status).toBe(200);
    expect((await removed.json()).draft.some((rule: { id: string }) => rule.id === id)).toBeFalse();
  });

  test("only the dedicated secret scope can read subscription links", async () => {
    ownerCookie();
    const monitor = app.auth.createApiToken("monitor", ["status:read"]).token;
    const reader = app.auth.createApiToken("reader", ["connections:read"]).token;
    const secrets = app.auth.createApiToken("secrets", ["connections:secret"]).token;
    const connection = app.connections.create({ name: "Мама" });
    await app.connectionSync.activate(connection.id);
    const status = await tokenRequest("/api/v1/status", monitor);
    const monitoredSubscription = await tokenRequest(`/api/v1/connections/${connection.id}/subscription`, monitor);
    const readSubscription = await tokenRequest(`/api/v1/connections/${connection.id}/subscription`, reader);
    const secretSubscription = await tokenRequest(`/api/v1/connections/${connection.id}/subscription`, secrets);
    expect(status.status).toBe(200);
    expect(monitoredSubscription.status).toBe(403);
    expect(readSubscription.status).toBe(403);
    expect(secretSubscription.status).toBe(200);
    expect((await secretSubscription.json()).subscription.url).toContain("/s/");
  });

  test("requires a name and creates connections with one secret link", async () => {
    const cookie = ownerCookie();
    const response = await request("/api/v1/connections", cookie, "POST", { name: "Мама", avatar: "avatar-8" });
    const created = await response.json();
    expect(response.status).toBe(201);
    expect(created).toMatchObject({ state: "ready", connection: { name: "Мама", avatar: "avatar-8", status: "active", generation: 1 } });
    expect(created.subscription.url).toContain("/s/");
    expect(created.subscription.qrUrl).toBe(`${created.subscription.url}/qr/landing.svg`);
    expect(created.catalogVersion).toBe(3);
    expect(created.applications.length).toBeGreaterThan(10);
    expect(typeof created.applications[0].id).toBe("string");
    expect(typeof created.applications[0].pricing.model).toBe("string");
    expect(typeof created.applications[0].pricing.billing).toBe("string");
    expect(created.applications[0].pricing.sourceUrl).toStartWith("https://");
    expect(created.applications[0].profileUrl).toContain("/apps/");
    expect(created.applications[0].qrUrl).toContain("/qr/");
    expect(created.advanced.map((item: { id: string }) => item.id)).toEqual(["vless-links", "mihomo-yaml", "sing-box-json", "xray-json"]);
    expect(created.subscription).not.toHaveProperty("formats");
    expect(created.subscription).not.toHaveProperty("qrDataUrl");

    const unnamed = await request("/api/v1/connections", cookie, "POST", {});
    expect(unnamed.status).toBe(400);

    const groupResponse = await request("/api/v1/connections", cookie, "POST", { name: "Семья", avatar: "avatar-group" });
    expect(groupResponse.status).toBe(201);
    expect(await groupResponse.json()).toMatchObject({ connection: { name: "Семья", avatar: "avatar-group" } });

    const repeated = await (await request(`/api/v1/connections/${created.connection.id}/subscription`, cookie)).json();
    expect(repeated.subscription.url).toBe(created.subscription.url);

    const list = await (await request("/api/v1/connections", cookie)).json();
    expect(list.connections).toHaveLength(2);
    expect(JSON.stringify(list)).not.toContain(created.subscription.url);
    expect(JSON.stringify(list)).not.toContain("credentials");
    expect(JSON.stringify(list)).not.toContain("subscription_token_hash");
  });

  test("renames, rotates and archives a connection", async () => {
    const cookie = ownerCookie();
    const created = await (await request("/api/v1/connections", cookie, "POST", { name: "Гости" })).json();
    const id = created.connection.id;
    const oldUrl = created.subscription.url;
    const updated = await (await request(`/api/v1/connections/${id}`, cookie, "PATCH", { name: "Семья", avatar: "avatar-group" })).json();
    expect(updated).toMatchObject({ name: "Семья", avatar: "avatar-group" });

    const rotated = await (await request(`/api/v1/connections/${id}/rotate`, cookie, "POST", {})).json();
    expect(rotated.state).toBe("ready");
    expect(rotated.subscription.url).not.toBe(oldUrl);
    const revoked = oldUrl.replace("localhost:8181", "localhost");
    expect((await app.fetch(new Request(revoked))).status).toBe(404);
    expect((await app.fetch(new Request(`${revoked}/apps/everywhere`))).status).toBe(404);
    expect((await app.fetch(new Request(`${revoked}/qr/everywhere.svg`))).status).toBe(404);

    const archived = await request(`/api/v1/connections/${id}`, cookie, "DELETE");
    expect(archived.status).toBe(202);
    expect((await archived.json()).state).toBe("archived");
    expect(app.connections.list()).toHaveLength(0);
  });

  test("API tokens rotate connections only through a matching confirmation", async () => {
    ownerCookie();
    const connection = app.connections.create({ name: "Семья" });
    const ready = await app.connectionSync.activate(connection.id);
    const oldUrl = ready.subscription!.url;
    const operationsOnly = app.auth.createApiToken("operations", ["operations:write"]).token;
    const manager = app.auth.createApiToken("manager", [
      "operations:read", "operations:write", "connections:secret", "connections:rotate",
    ]).token;
    const payload = { connectionId: connection.id };

    const missingScope = await tokenRequest("/api/v1/operations/preview", operationsOnly, "POST", {
      action: "connection.rotate",
      payload,
    });
    expect(missingScope.status).toBe(403);

    const direct = await tokenRequest(`/api/v1/connections/${connection.id}/rotate`, manager, "POST", {});
    expect(direct.status).toBe(403);

    const previewResponse = await tokenRequest("/api/v1/operations/preview", manager, "POST", {
      action: "connection.rotate",
      payload,
    });
    const preview = await previewResponse.json();
    expect(previewResponse.status).toBe(201);
    expect(preview).toMatchObject({
      action: "connection.rotate",
      preview: { title: "Rotate connection “Семья”", payload },
    });
    expect(app.connections.get(connection.id).generation).toBe(1);

    const mismatch = await tokenRequest("/api/v1/operations/confirm", manager, "POST", {
      confirmationId: preview.confirmationId,
      action: "connection.rotate",
      payload: { connectionId: crypto.randomUUID() },
    });
    expect(mismatch.status).toBe(409);
    expect(app.connections.get(connection.id).generation).toBe(1);

    const confirmed = await tokenRequest("/api/v1/operations/confirm", manager, "POST", {
      confirmationId: preview.confirmationId,
      action: "connection.rotate",
      payload,
    });
    expect(confirmed.status).toBe(202);

    for (let attempt = 0; attempt < 20 && app.operations.list()[0]?.status !== "completed"; attempt++) {
      await Bun.sleep(5);
    }
    expect(app.connections.get(connection.id).generation).toBe(2);
    const repeated = await tokenRequest(`/api/v1/connections/${connection.id}/subscription`, manager);
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).subscription.url).not.toBe(oldUrl);
    expect((await app.fetch(new Request(oldUrl.replace("localhost:8181", "localhost")))).status).toBe(404);
    expect(app.operations.list()[0]).toMatchObject({ kind: "connection.rotate", status: "completed" });
    expect(app.journal.list({ q: "credentials" }).events.map((event) => event.type)).toContain("connection.rotated");
  });

  test("rejects physical-device fields and all removed APIs", async () => {
    const cookie = ownerCookie();
    const invalid = await request("/api/v1/connections", cookie, "POST", { platform: "ios" });
    const note = await request("/api/v1/connections", cookie, "POST", { note: "лишнее поле" });
    const people = await request("/api/v1/people", cookie);
    const accesses = await request("/api/v1/accesses/legacy", cookie);
    const devices = await request("/api/v1/devices", cookie);
    expect(invalid.status).toBe(400);
    expect(note.status).toBe(400);
    expect(people.status).toBe(404);
    expect(accesses.status).toBe(404);
    expect(devices.status).toBe(404);
  });

  test("returns 202 while activation is queued for retry", async () => {
    const cookie = ownerCookie();
    const unavailable = new HttpApplication(fixture.db, {
      async add() { throw new Error("agent unavailable"); },
      async rotate() { return { ok: true }; },
      async revoke() { return { ok: true }; },
    });
    const response = await unavailable.fetch(new Request("http://localhost/api/v1/connections", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Мама" }),
    }));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ state: "retrying", connection: { status: "provisioning" }, error: "agent unavailable" });
  });

  test("application profiles support GET, HEAD, ETag, no-store, lazy QR and legacy 410 semantics", async () => {
    const connection = app.connections.create({ name: "Мама" });
    const ready = await app.connectionSync.activate(connection.id);
    const url = ready.subscription!.url.replace("localhost:8181", "localhost");

    const browser = await app.fetch(new Request(`${url}?platform=ios`, { headers: { "user-agent": "Clash Verge" } }));
    expect(browser.status).toBe(200);
    expect(browser.headers.get("content-type")).toContain("text/html");
    expect(await browser.text()).toContain('data-platform-panel="ios"');
    expect(app.connections.get(connection.id).last_fetched_at).toBeNull();

    const legacy = await app.fetch(new Request(`${url}?format=sing-box`));
    expect(legacy.status).toBe(410);
    expect(app.connections.get(connection.id).last_fetched_at).toBeNull();

    const qr = await app.fetch(new Request(`${url}/qr/everywhere.svg`));
    expect(qr.status).toBe(200);
    expect(qr.headers.get("content-type")).toContain("image/svg+xml");
    expect(await qr.text()).toContain("<svg");
    expect(app.connections.get(connection.id).last_fetched_at).toBeNull();

    const qrHead = await app.fetch(new Request(`${url}/qr/everywhere.svg`, { method: "HEAD" }));
    expect(qrHead.status).toBe(200);
    expect(qrHead.headers.get("etag")).toBe(qr.headers.get("etag"));
    expect(await qrHead.text()).toBe("");
    const qrCached = await app.fetch(new Request(`${url}/qr/everywhere.svg`, { headers: { "if-none-match": qr.headers.get("etag")! } }));
    expect(qrCached.status).toBe(304);
    expect(app.connections.get(connection.id).last_fetched_at).toBeNull();

    const profileUrl = `${url}/apps/clash-verge`;
    const head = await app.fetch(new Request(profileUrl, { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toContain("text/yaml");
    expect(head.headers.get("etag")).toStartWith('"');
    expect(await head.text()).toBe("");
    expect(app.connections.get(connection.id).last_fetched_at).toBeNull();

    const cached = await app.fetch(new Request(profileUrl, { headers: { "if-none-match": head.headers.get("etag")! } }));
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe("");
    expect(app.connections.get(connection.id).last_fetched_at).toBeNull();

    const mihomo = await app.fetch(new Request(profileUrl));
    expect(mihomo.status).toBe(200);
    expect(mihomo.headers.get("etag")).toBe(head.headers.get("etag"));
    expect(await mihomo.text()).toContain("mixed-port: 7890");
    const current = app.connections.get(connection.id);
    expect(current.first_used_at).not.toBeNull();
    expect(current.last_fetched_at).not.toBeNull();
    expect(current).not.toHaveProperty("last_profile_format");
    expect(app.journal.list({ q: "впервые использована" }).events).toHaveLength(1);

    const singBox = await app.fetch(new Request(`${url}/apps/sing-box-android`));
    expect(JSON.parse(await singBox.text()).outbounds[1].transport.type).toBe("grpc");

    const xray = await app.fetch(new Request(`${url}/apps/v2rayng`));
    const xrayProfile = await xray.json();
    expect(xray.headers.get("content-type")).toContain("application/json");
    expect(xrayProfile.outbounds[0]).toMatchObject({ protocol: "vless", tag: "proxy-xhttp" });
    expect(xrayProfile.routing.rules.length).toBeGreaterThan(0);

    const incy = await app.fetch(new Request(`${url}/apps/incy`, { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } }));
    expect(incy.headers.get("no-limit-enabled")).toBe("1");
    expect(incy.headers.get("autorouting")).toBe(`${ready.subscription!.url}/routes`);
    expect(await incy.text()).toContain("vless://");

    const routes = await app.fetch(new Request(`${url}/routes`));
    expect(routes.status).toBe(200);
    expect(await routes.json()).toHaveProperty("GlobalProxy");

    for (const response of [browser, legacy, qr, qrHead, qrCached, head, cached, mihomo, incy, routes]) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }

    const stash = await app.fetch(new Request(`${url}/apps/stash`));
    expect(await stash.text()).toStartWith(`#SUBSCRIBED ${ready.subscription!.url}/apps/stash\n`);

    const missingApp = await app.fetch(new Request(`${url}/apps/not-real`));
    const missingQr = await app.fetch(new Request(`${url}/qr/not-real.svg`));
    expect(missingApp.status).toBe(404);
    expect(missingQr.status).toBe(404);
  });

  test("connection appearance and owner timezone remain editable", async () => {
    const connection = app.connections.create({ name: "Мама", avatar: "avatar-8" });
    expect(app.connections.update(connection.id, { avatar: "avatar-group" }).avatar).toBe("avatar-group");
    const cookie = ownerCookie();
    const response = await request("/api/v1/me", cookie, "PATCH", { timezone: "Asia/Yerevan" });
    expect(await response.json()).toEqual({ owner: { id: "owner", timezone: "Asia/Yerevan", language: "en" } });
  });

  test("persists the owner language and rejects unknown locales with a stable localized error", async () => {
    const cookie = ownerCookie();
    const invalid = await app.fetch(new Request("http://localhost/api/v1/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie, "X-Outpost-Language": "fa" },
      body: JSON.stringify({ language: "de" }),
    }));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("content-language")).toBe("en");
    expect(await invalid.json()).toMatchObject({
      code: "validation.invalid",
      message: "Check the entered data.",
      requestId: expect.any(String),
      details: expect.any(Array),
    });

    const updated = await request("/api/v1/me", cookie, "PATCH", { language: "fa" });
    expect(await updated.json()).toEqual({ owner: { id: "owner", timezone: "Europe/Moscow", language: "fa" } });
    const me = await app.fetch(new Request("http://localhost/api/v1/me", { headers: { cookie, "X-Outpost-Language": "en" } }));
    expect(me.headers.get("content-language")).toBe("fa");
    expect((await me.json()).owner.language).toBe("fa");
  });

  test("localizes public errors and server pages from an explicit locale", async () => {
    const missing = await app.fetch(new Request("http://localhost/s/not-a-token?lang=fa"));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-language")).toBe("fa");
    expect(await missing.json()).toMatchObject({
      code: "subscription.not_found",
      message: "پیوند پیدا نشد یا لغو شده است.",
      requestId: expect.any(String),
    });

    const root = await app.fetch(new Request("http://localhost/?lang=zh-Hans"));
    expect(root.headers.get("content-language")).toBe("zh-CN");
    expect(await root.text()).toContain('<html lang="zh-CN" dir="ltr">');
  });
});
