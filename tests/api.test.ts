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

  test("public health endpoints are available and protected endpoints require a session", async () => {
    const health = await app.fetch(new Request("http://localhost/healthz"));
    const connections = await app.fetch(new Request("http://localhost/api/v1/connections"));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true });
    expect(health.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(connections.status).toBe(401);
  });

  test("status tokens cannot read subscription secrets", async () => {
    ownerCookie();
    const token = app.auth.createApiToken("monitor", ["status:read"]).token;
    const headers = { authorization: `Bearer ${token}` };
    const connection = app.connections.create({ name: "Мама" });
    await app.connectionSync.activate(connection.id);
    const status = await app.fetch(new Request("http://localhost/api/v1/status", { headers }));
    const subscription = await app.fetch(new Request(`http://localhost/api/v1/connections/${connection.id}/subscription`, { headers }));
    expect(status.status).toBe(200);
    expect(subscription.status).toBe(403);
  });

  test("requires a name and creates connections with one secret link", async () => {
    const cookie = ownerCookie();
    const response = await request("/api/v1/connections", cookie, "POST", { name: "Мама", avatar: "avatar-8" });
    const created = await response.json();
    expect(response.status).toBe(201);
    expect(created).toMatchObject({ state: "ready", connection: { name: "Мама", avatar: "avatar-8", status: "active", generation: 1 } });
    expect(created.subscription.url).toContain("/s/");
    expect(created.subscription.qrDataUrl).toStartWith("data:image/png;base64,");
    expect(Object.keys(created.subscription.formats).sort()).toEqual(["links", "mihomo", "sing-box", "xray", "xray-json"]);

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
    expect((await app.fetch(new Request(oldUrl.replace("localhost:8181", "localhost")))).status).toBe(404);

    const archived = await request(`/api/v1/connections/${id}`, cookie, "DELETE");
    expect(archived.status).toBe(202);
    expect((await archived.json()).state).toBe("archived");
    expect(app.connections.list()).toHaveLength(0);
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

  test("subscription negotiation records use without persisting a client format", async () => {
    const connection = app.connections.create({ name: "Мама" });
    const ready = await app.connectionSync.activate(connection.id);
    const url = ready.subscription!.url.replace("localhost:8181", "localhost");

    const browser = await app.fetch(new Request(url, { headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (iPhone)" } }));
    const mihomo = await app.fetch(new Request(url, { headers: { "user-agent": "Clash Verge" } }));
    const singBox = await app.fetch(new Request(`${url}?format=sing-box`));
    const links = await app.fetch(new Request(`${url}?format=links`, { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } }));

    expect(browser.headers.get("content-type")).toContain("text/html");
    expect(mihomo.headers.get("content-type")).toContain("text/yaml");
    expect(JSON.parse(await singBox.text()).outbounds[1].transport.type).toBe("grpc");
    expect(links.headers.get("no-limit-enabled")).toBe("1");
    const current = app.connections.get(connection.id);
    expect(current.first_used_at).not.toBeNull();
    expect(current.last_fetched_at).not.toBeNull();
    expect(current).not.toHaveProperty("last_profile_format");
    expect(app.journal.list({ q: "впервые использована" }).events).toHaveLength(1);
  });

  test("connection appearance and owner timezone remain editable", async () => {
    const connection = app.connections.create({ name: "Мама", avatar: "avatar-8" });
    expect(app.connections.update(connection.id, { avatar: "avatar-group" }).avatar).toBe("avatar-group");
    const cookie = ownerCookie();
    const response = await request("/api/v1/me", cookie, "PATCH", { timezone: "Asia/Yerevan" });
    expect(await response.json()).toEqual({ owner: { id: "owner", timezone: "Asia/Yerevan" } });
  });
});
