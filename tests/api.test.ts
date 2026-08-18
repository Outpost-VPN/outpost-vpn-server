import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HttpApplication } from "../src/server/http";
import { database } from "./helpers";

describe("HTTP API", () => {
  let fixture: ReturnType<typeof database>;
  let app: HttpApplication;
  beforeEach(() => {
    fixture = database();
    app = new HttpApplication(fixture.db, {
      async add() { return { ok: true }; },
      async revoke() { return { ok: true }; },
    });
  });
  afterEach(() => fixture.close());

  test("public health endpoints are available", async () => {
    const response = await app.fetch(new Request("http://localhost/healthz"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  test("protected endpoints require a session", async () => {
    const response = await app.fetch(new Request("http://localhost/api/v1/people"));
    expect(response.status).toBe(401);
  });

  test("status tokens can read only the minimal status endpoint, not the owner dashboard", async () => {
    const timestamp = new Date().toISOString();
    fixture.db.raw.query("INSERT INTO owners (id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("owner", "Федор", "Europe/Moscow", timestamp, timestamp);
    const token = app.auth.createApiToken("monitor", ["status:read"]).token;
    const headers = { authorization: `Bearer ${token}` };

    const status = await app.fetch(new Request("http://localhost/api/v1/status", { headers }));
    const dashboard = await app.fetch(new Request("http://localhost/api/v1/dashboard", { headers }));

    expect(status.status).toBe(200);
    expect(await status.json()).toEqual(expect.objectContaining({ version: expect.any(String), services: expect.any(Array) }));
    expect(dashboard.status).toBe(403);
  });

  test("invitation GET does not consume a token", async () => {
    const people = app.people;
    const person = people.create({ name: "Мама" });
    const created = people.createDevice(person.id, { name: "iPhone", platform: "ios", client: "incy" });
    const token = created.invitation.url.split("/").at(-1)!;
    const first = await app.fetch(new Request(`http://localhost/api/v1/invitations/${token}`));
    const second = await app.fetch(new Request(`http://localhost/api/v1/invitations/${token}`));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  test("device responses never expose subscription hashes", () => {
    const person = app.people.create({ name: "Мама" });
    app.people.createDevice(person.id, { name: "iPhone", platform: "ios", client: "incy" });
    expect(JSON.stringify(app.people.list())).not.toContain("subscription_token_hash");
  });

  test("device kind is stored independently from its editable name", () => {
    const person = app.people.create({ name: "Мама" });
    const created = app.people.createDevice(person.id, { name: "Мои очки", kind: "vr", platform: "unknown", client: "incy" });
    expect(created.device.kind).toBe("vr");
    expect(app.people.get(person.id).devices[0]?.kind).toBe("vr");
  });

  test("device can be renamed without recreating its connection", () => {
    const person = app.people.create({ name: "Мама" });
    const created = app.people.createDevice(person.id, { name: "iPhone", kind: "phone", platform: "ios", client: "incy" });
    const updated = app.people.updateDevice(created.device.id, { name: "Рабочий ноутбук", kind: "computer", platform: "macos" });
    expect(updated).toMatchObject({
      id: created.device.id,
      person_id: person.id,
      name: "Рабочий ноутбук",
      kind: "computer",
      platform: "macos",
      client: "incy",
      status: "invited",
    });
  });

  test("person avatars are stored in the shared avatar catalog", () => {
    const person = app.people.create({ name: "Мама", avatar: "avatar-8" });
    expect(app.people.get(person.id).avatar).toBe("avatar-8");
    expect(app.people.update(person.id, { avatar: "avatar-9" }).avatar).toBe("avatar-9");
  });

  test("owner can be renamed without recreating credentials", () => {
    const timestamp = new Date().toISOString();
    fixture.db.raw.query("INSERT INTO owners (id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("owner", "Федор", "Europe/Moscow", timestamp, timestamp);
    expect(app.auth.updateOwner({ name: "Фёдор" })).toMatchObject({ name: "Фёдор", timezone: "Europe/Moscow" });
    expect(app.auth.state().owner?.name).toBe("Фёдор");
  });

  test("owner can change the personal timezone", () => {
    const timestamp = new Date().toISOString();
    fixture.db.raw.query("INSERT INTO owners (id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("owner", "Федор", "Europe/Moscow", timestamp, timestamp);
    expect(app.auth.updateOwner({ timezone: "Asia/Yerevan" })).toMatchObject({ name: "Федор", timezone: "Asia/Yerevan" });
    expect(app.auth.state().owner?.timezone).toBe("Asia/Yerevan");
  });

  test("invitation page is served by the public SPA route", async () => {
    const response = await app.fetch(new Request("http://localhost/invite/example-token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  test("redeemed invitation can be reopened for 24 hours", async () => {
    const person = app.people.create({ name: "Мама" });
    const created = app.people.createDevice(person.id, { name: "iPhone", platform: "ios", client: "incy" });
    const token = created.invitation.url.split("/").at(-1)!;
    const redeemed = await app.deviceSync.redeem(token);
      if (redeemed.pending) throw new Error("Device activation did not complete");
      const repeated = app.people.redemption(redeemed.redemptionToken);
      expect(repeated.subscriptionUrl).toBe(redeemed.subscriptionUrl);
      expect(repeated).not.toHaveProperty("subscriptionToken");
  });

  test("records only the first profile fetch and tracks the routes version", async () => {
    const person = app.people.create({ name: "Мама" });
    const created = app.people.createDevice(person.id, { name: "iPhone", platform: "ios", client: "incy" });
    const redeemed = await app.deviceSync.redeem(created.invitation.url.split("/").at(-1)!);
    if (redeemed.pending) throw new Error("Device activation did not complete");
    const subscriptionToken = redeemed.subscriptionUrl.split("/").at(-1)!;
    app.routes.publish("Первая ревизия", "owner");

    const first = await app.fetch(new Request(`http://localhost/subscriptions/incy/${subscriptionToken}`));
    const second = await app.fetch(new Request(`http://localhost/subscriptions/incy/${subscriptionToken}`));
    const routes = await app.fetch(new Request(`http://localhost/routes/${subscriptionToken}.json`));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(routes.status).toBe(200);
    expect(app.journal.list({ q: "Профиль впервые загружен" }).events).toHaveLength(1);
    expect(app.people.device(redeemed.device.id).last_routes_version).toBe(1);
  });
});
