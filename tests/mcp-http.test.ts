import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { HttpApplication } from "../src/server/http";
import { config } from "../src/server/config";
import { createToken, hashToken } from "../src/server/security";
import { database } from "./helpers";

const endpoint = new URL("/api/v1/mcp", config.origin);
const rpc = (method: string, params?: unknown) => ({ jsonrpc: "2.0", id: 1, method, params });

describe("remote MCP", () => {
  let fixture: ReturnType<typeof database>;
  let app: HttpApplication;
  beforeEach(() => { fixture = database(); app = new HttpApplication(fixture.db); });
  afterEach(() => fixture.close());

  function request(token?: string, body: unknown = rpc("tools/list"), headers: Record<string, string> = {}, method = "POST") {
    return app.fetch(new Request(endpoint, {
      method,
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    }));
  }

  test("a standard HTTP MCP client initializes and updates the same settings as the panel", async () => {
    const credentials = app.auth.createApiToken("HTTP MCP", ["settings:read", "settings:write"]);
    const http = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => app.fetch(request) });
    const client = new Client({ name: "remote-test", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL("/api/v1/mcp", http.url), {
        requestInit: { headers: { authorization: `Bearer ${credentials.token}`, host: endpoint.host } },
      }));
      expect((await client.listTools()).tools.map(tool => tool.name)).toContain("settings_update");
      const changed = await client.callTool({ name: "settings_update", arguments: {
        network: { ipv6: true, mihomo: { tlsPorts: [443, 8080, "9443-9450"] } },
      } });
      expect(changed.isError).not.toBeTrue();
      expect(app.system.networkSettings()).toMatchObject({ ipv6: true, mihomo: { tlsPorts: [443, 8080, "9443-9450"] } });
      expect((await client.callTool({ name: "settings_get", arguments: {} })).isError).not.toBeTrue();
      const audit = fixture.db.raw.query<{actor:string}, []>("SELECT actor FROM audit_log WHERE action='settings.update'").get();
      expect(audit?.actor).toBe(`token:${credentials.id}`);
      // A new application instance reads the database, with no MCP session to restore.
      app = new HttpApplication(fixture.db);
      expect((await client.callTool({ name: "settings_get", arguments: {} })).isError).not.toBeTrue();
    } finally { await client.close(); await http.stop(true); }
  });

  test("requires an active API token on every request, never a browser session or URL token", async () => {
    const credentials = app.auth.createApiToken("HTTP MCP", ["settings:read"]);
    const timestamp = new Date().toISOString();
    fixture.db.raw.query("INSERT INTO owners (id,timezone,created_at,updated_at) VALUES ('owner','UTC',?,?)").run(timestamp,timestamp);
    const session = createToken();
    fixture.db.raw.query("INSERT INTO sessions (id,owner_id,token_hash,expires_at,created_at,last_seen_at) VALUES ('session','owner',?,?,?,?)")
      .run(hashToken(session),new Date(Date.now()+86400000).toISOString(),timestamp,timestamp);
    for (const denied of [
      await request(), await request("invalid"), await request(session),
      await request(undefined,undefined,{cookie:`outpost_session=${session}`}),
      await app.fetch(new Request(`${endpoint}?token=${credentials.token}`)),
    ]) {
      expect(denied.status).toBe(401);
      expect(denied.headers.get("www-authenticate")).toContain("Bearer");
      expect(denied.headers.get("cache-control")).toBe("no-store");
    }
    const valid = await request(credentials.token);
    expect(valid.status).toBe(200);
    expect(valid.headers.has("mcp-session-id")).toBeFalse();
    expect((await request(credentials.token,undefined,{cookie:`outpost_session=${session}`})).status).toBe(200);
    fixture.db.raw.query("UPDATE api_tokens SET expires_at=? WHERE id=?").run("2000-01-01T00:00:00.000Z",credentials.id);
    expect((await request(credentials.token)).status).toBe(401);
    fixture.db.raw.query("UPDATE api_tokens SET expires_at=NULL, revoked_at=? WHERE id=?").run(timestamp,credentials.id);
    expect((await request(credentials.token)).status).toBe(401);
  });

  test("isolates concurrent tokens and preserves scoped API permissions and validation", async () => {
    const writer = app.auth.createApiToken("writer", ["settings:read","settings:write"]);
    const reader = app.auth.createApiToken("reader", ["settings:read"]);
    const call = (token: string, name: string, args = {}) => request(token,rpc("tools/call",{name,arguments:args})).then(r=>r.json());
    const [allowed,denied] = await Promise.all([
      call(writer.token,"settings_update",{network:{ipv6:true}}),
      call(reader.token,"settings_update",{network:{ipv6:false}}),
    ]);
    expect(allowed.result.isError).not.toBeTrue();
    expect(denied.result.isError).toBeTrue();
    expect(JSON.stringify(denied)).toContain("403");
    expect(app.system.networkSettings().ipv6).toBeTrue();
    expect((await call(writer.token,"settings_update",{network:{mihomo:{tlsPorts:[70000]}}})).result.isError).toBeTrue();
    expect((await call(reader.token,"route_add",{action:"DIRECT",matcher:"DOMAIN",value:"example.com"})).result.isError).toBeTrue();
    expect((await call(reader.token,"operation_preview",{action:"service.restart",payload:{service:"xray"}})).result.isError).toBeTrue();
    expect(app.system.networkSettings().ipv6).toBeTrue();
  });

  test("rejects foreign origins and hosts and implements the stateless HTTP transport contract", async () => {
    const token = app.auth.createApiToken("reader", ["settings:read"]).token;
    expect((await request(token,undefined,{origin:"https://untrusted.example"})).status).toBe(403);
    expect((await request(token,undefined,{origin:"null"})).status).toBe(403);
    expect((await request(token,undefined,{host:"untrusted.example"})).status).toBe(403);
    expect((await request(token,undefined,{origin:endpoint.origin})).status).toBe(200);
    for(const method of ["GET","DELETE","OPTIONS","PUT"]) {
      const response=await request(token,undefined,{},method);
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
    expect((await request(token,undefined,{"mcp-protocol-version":"invalid"})).status).toBe(400);
    expect((await request(token,undefined,{accept:"text/plain"})).status).toBe(406);
    expect((await request(token,undefined,{"content-type":"text/plain"})).status).toBe(415);
    expect((await request(token,{jsonrpc:"2.0",method:"notifications/initialized"})).status).toBe(202);
    const invalid = await app.fetch(new Request(endpoint,{method:"POST",headers:{authorization:`Bearer ${token}`},body:"{"}));
    expect(invalid.status).toBe(400);
    // The byte limit applies even when a client omits Content-Length.
    const large = new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1024*1024+1));controller.close();}});
    expect((await app.fetch(new Request(endpoint,{method:"POST",headers:{authorization:`Bearer ${token}`},body:large}))).status).toBe(413);
  });

  test("does not inherit the anonymous demo owner or expose MCP during setup", async () => {
    const token=app.auth.createApiToken("reader",["settings:read"]).token;
    const mutable=config as unknown as {demo:boolean;setup:boolean};
    const before={demo:config.demo,setup:config.setup};
    try {
      mutable.demo=true;
      expect((await request(token)).status).toBe(404);
      expect((await request()).status).toBe(404);
      mutable.demo=false; mutable.setup=true;
      expect((await request(token)).status).toBe(404);
    } finally { Object.assign(mutable,before); }
  });
});
