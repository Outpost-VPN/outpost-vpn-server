import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HttpApplication } from "../src/server/http";
import { createToken, hashToken } from "../src/server/security";
import { config } from "../src/server/config";
import { database } from "./helpers";

type ServerEvent = { event: string; data: Record<string, unknown> };

describe("dashboard synchronization", () => {
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

  test("requires an owner session and exposes stream-safe headers", async () => {
    expect((await app.fetch(new Request("http://localhost/api/v1/dashboard/events"))).status).toBe(401);

    const cookie = ownerCookie();
    const token = app.auth.createApiToken("reader", ["status:read"]).token;
    const scoped = await app.fetch(new Request("http://localhost/api/v1/dashboard/events", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(scoped.status).toBe(403);

    const response = await request("/api/v1/dashboard/events", cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    await response.body?.cancel();
  });

  test("sends ready and co-ordinated collector, mutation and operation revisions", async () => {
    const cookie = ownerCookie();
    const response = await request("/api/v1/dashboard/events", cookie);
    const reader = response.body!.getReader();
    const next = eventReader(reader);

    const ready = await next();
    expect(ready).toMatchObject({ event: "ready", data: { revision: 0 } });
    expect(app.dashboardEvents.subscriberCount).toBe(1);

    await app.collectTraffic();
    const traffic = await next();
    expect(traffic).toMatchObject({ event: "snapshot", data: { revision: 1, reason: "traffic" } });
    expect(traffic.data.at).toBeString();

    const mutation = await request("/api/v1/tokens", cookie, "POST", { name: "monitor", scopes: ["status:read"] });
    expect(mutation.status).toBe(201);
    expect(await next()).toMatchObject({ event: "snapshot", data: { revision: 2, reason: "mutation" } });

    const connection = app.connections.create({ name: "Семья" });
    await app.connectionSync.activate(connection.id);
    const payload = { connectionId: connection.id };
    const preview = app.operations.preview("connection.rotate", payload);
    app.operations.confirm(preview.confirmationId, "connection.rotate", payload);
    expect(await next()).toMatchObject({ event: "snapshot", data: { revision: 3, reason: "operations" } });

    const dashboard = await (await request("/api/v1/dashboard", cookie)).json() as { revision: number } & Record<string, unknown>;
    const revision = dashboard.revision;
    expect(dashboard).toMatchObject({
      revision: expect.any(Number),
      security: { passkeys: [], sessions: [{ current: true }], tokens: [{ name: "monitor" }] },
    });
    expect(revision).toBe(app.dashboardEvents.revision);

    await reader.cancel();
    await Bun.sleep(0);
    expect(app.dashboardEvents.subscriberCount).toBe(0);
  });

  test("versions admin assets while keeping development responses revalidated", async () => {
    const response = await app.fetch(new Request("http://localhost/admin/"));
    const html = await response.text();
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(html).toContain(`/app.js?v=`);
    expect(html).toContain(`/vendor/phosphor/style.css?v=`);
    expect(html).not.toContain("__OUTPOST_VERSION__");

    const version = new URL(html.match(/src="([^"]+app\.js[^"]+)"/)![1]!, "http://localhost");
    const asset = await app.fetch(new Request(version));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("no-cache");
    expect(asset.headers.get("cache-control")).not.toContain("immutable");

    const mutable = config as unknown as { production: boolean };
    const production = mutable.production;
    try {
      mutable.production = true;
      const cached = await app.fetch(new Request(version));
      expect(cached.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    } finally {
      mutable.production = production;
    }
  });
});

function eventReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  return async () => {
    const read = async (): Promise<ServerEvent> => {
      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = block.split("\n");
          const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
          const data = lines.filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim()).join("\n");
          if (event) return { event, data: data ? JSON.parse(data) : {} };
          continue;
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error("SSE stream closed before the next event");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    };
    return Promise.race([
      read(),
      Bun.sleep(1_000).then(() => { throw new Error("Timed out waiting for SSE event"); }),
    ]);
  };
}
