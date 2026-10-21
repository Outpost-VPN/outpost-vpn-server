import { expect, spyOn, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/server/mcp-tools";
import { OutpostApi } from "../src/shared/api";
import { HttpApplication } from "../src/server/http";
import { database } from "./helpers";
import { tokenScopes } from "../src/shared/api-scopes";
import {ConnectionDiagnostics} from "../src/server/services/connection-diagnostics";

test("MCP diagnostics expose scoped reads and client operation lifecycle without leaking secrets", async () => {
  const fixture = database(), app = new HttpApplication(fixture.db);
  const reader = app.auth.createApiToken("Diagnostic reader", [...tokenScopes.read]).token;
  const manager = app.auth.createApiToken("Diagnostic manager", [...tokenScopes.manage]).token;
  const api = new OutpostApi({url: "http://localhost", token: manager}, request => app.fetch(request));
  const server = createMcpServer(api), client = new Client({name: "diagnostics-test", version: "1"});
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  const content = (value: Awaited<ReturnType<Client["callTool"]>>) => JSON.parse((value.content as Array<{text: string}>)[0]!.text);
  let operationId: string | undefined;
  try {
    await server.connect(peer); await client.connect(transport);
    const tools = (await client.listTools()).tools.map(tool => tool.name);
    expect(tools).toEqual(expect.arrayContaining(["system_metrics_get", "connection_diagnostics_get", "events_get", "operations_get", "diagnostic_run", "diagnostic_get", "diagnostic_cancel"]));
    const metrics = content(await client.callTool({name: "system_metrics_get", arguments: {}}));
    expect(metrics).toHaveProperty("sampledAt"); expect(metrics).toHaveProperty("stale");
    expect(JSON.stringify(metrics)).not.toContain("xhttp-change-me");
    const connection = app.connections.create({name: "Diagnostic test"}); app.connections.completeActivation(connection.id, 1, "test");
    const detail = content(await client.callTool({name: "connection_diagnostics_get", arguments: {connection_id: connection.id}}));
    expect(detail.connectionId).toBe(connection.id); expect(detail.telemetry.length).toBeGreaterThan(0);
    expect(JSON.stringify(detail)).not.toContain(app.connections.credentials(connection.id).hysteria.password);
    const journal = [
      {sampledAt: 1700000001000, engine: "hysteria", type: "error", reason: "client_cancelled_stream", level: "warn", count: 1},
      {sampledAt: 1700000002000, engine: "hysteria", type: "error", reason: "upstream_connect_timeout", level: "error", count: 1},
      {sampledAt: 1700000003000, engine: "hysteria", type: "disconnected", reason: "idle_timeout", level: "info", count: 4,
        firstSampledAt: 1700000002999, lastSampledAt: 1700000003001, related: [{type: "error", level: "warn", count: 3}]},
    ];
    const diagnostics = new ConnectionDiagnostics(fixture.db, app.connections, async request => {
      expect(request.action).toBe("logs.read");
      expect(request.payload).toMatchObject({connectionId: connection.id, limit: 25});
      return {ok: true, output: JSON.stringify({events: request.payload.engine === "hysteria" ? journal : [], truncated: false})};
    });
    const read = spyOn(app.connectionDiagnostics, "get").mockImplementation((id, includeEvents) => diagnostics.get(id, includeEvents));
    try {
      const grouped = content(await client.callTool({name: "connection_diagnostics_get", arguments: {connection_id: connection.id, includeEvents: true}}));
      expect(grouped.recentEvents.find((row: any) => row.engine === "hysteria")).toMatchObject({status: "available", events: journal, truncated: false});
    } finally {read.mockRestore();}
    const time = new Date(Date.now() - 60_000);
    app.traffic.recordCumulative("xray", {connectionId: connection.id, upload: 10, download: 20}, time);
    const filtered = content(await client.callTool({name: "traffic_get", arguments: {connectionId: connection.id, includeSeries: false}}));
    expect(filtered.connections).toHaveLength(1); expect(filtered.series).toEqual([]); expect(filtered.totals).toEqual({upload: 10, download: 20});
    const events = content(await client.callTool({name: "events_get", arguments: {connectionId: connection.id, limit: 1}}));
    expect(events.events).toHaveLength(1); expect(events.events[0].subject.id).toBe(connection.id);
    const started = content(await client.callTool({name: "diagnostic_run", arguments: {kind: "reachability", vantage: "client"}}));
    operationId = started.id;
    expect(started.runner.command).toContain(started.id);
    expect(content(await client.callTool({name: "operations_get", arguments: {operation_id: started.id}})).kind).toBe("diagnostic");
    expect(content(await client.callTool({name: "diagnostic_cancel", arguments: {diagnostic_id: started.id}})).status).toBe("cancelled");
    expect(content(await client.callTool({name: "diagnostic_get", arguments: {diagnostic_id: started.id}})).status).toBe("cancelled");
    const readApi = new OutpostApi({url: "http://localhost", token: reader}, request => app.fetch(request));
    await expect(readApi.post("/api/v1/diagnostics", {kind: "speed"})).rejects.toThrow("403");
    await expect(readApi.post(`/api/v1/diagnostics/${started.id}/claim`)).rejects.toThrow("403");
    const runnerToken = app.auth.createApiToken("Limited runner", ["diagnostics:run"]).token;
    const runnerApi = new OutpostApi({url: "http://localhost", token: runnerToken}, request => app.fetch(request));
    const limitedJob = await runnerApi.post<{id: string}>("/api/v1/diagnostics", {kind: "reachability", vantage: "client"});
    operationId = limitedJob.id;
    await expect(runnerApi.post(`/api/v1/diagnostics/${limitedJob.id}/claim`)).rejects.toThrow("403");
    const large = new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(1024 * 1024 + 1)); controller.close();}});
    const rejected = await app.fetch(new Request(`http://localhost/api/v1/diagnostics/${limitedJob.id}/report`, {
      method: "POST", headers: {authorization: `Bearer ${manager}`}, body: large,
    }));
    expect(rejected.status).toBe(413);
  } finally {
    if (operationId) app.diagnostics.cancel(operationId, "test");
    await Bun.sleep(5); await client.close(); await server.close(); fixture.close();
  }
});

test("MCP settings use the same persisted, validated and scoped API as the panel", async () => {
  const fixture = database();
  const app = new HttpApplication(fixture.db);
  const token = app.auth.createApiToken("MCP test", ["settings:read", "settings:write"]).token;
  const http = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => app.fetch(request) });
  const api = new OutpostApi({ url: http.url.origin, token });
  const server = createMcpServer(api);
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(expect.arrayContaining(["settings_get", "settings_update"]));
    const changed = await client.callTool({ name: "settings_update", arguments: {
      network: { ipv6: true, mihomo: { tlsPorts: [443, "8000-8100"] } },
    } });
    expect(changed.isError).not.toBeTrue();
    const panel = await api.get<{ network: { ipv6: boolean; mihomo: { tlsPorts: unknown[] } } }>("/api/v1/settings");
    expect(panel.network.ipv6).toBeTrue();
    expect(panel.network.mihomo.tlsPorts).toEqual([443, "8000-8100"]);
    const invalid = await client.callTool({ name: "settings_update", arguments: { network: { mihomo: { tlsPorts: [65536] } } } });
    expect(invalid.isError).toBeTrue();
    expect(app.system.networkSettings().mihomo.tlsPorts).toEqual([443, "8000-8100"]);
    expect((await client.callTool({ name: "settings_get", arguments: {} })).isError).not.toBeTrue();
  } finally {
    await client.close();
    await server.close();
    await http.stop(true);
    fixture.close();
  }
});

test("MCP methods share panel validation, runtime application and engine scopes", async () => {
  const fixture = database();
  const applied: string[] = [];
  const app = new HttpApplication(fixture.db, {
    async add() { return {ok:true}; },
    async rotate() { return {ok:true}; },
    async revoke() { return {ok:true}; },
    async reconfigure(engine) { applied.push(engine); return {ok:true}; },
  });
  for (const id of ["mihomo", "sing-box"] as const) fixture.db.engines.recordInstallation(id, id === "mihomo" ? "1.19.32" : "1.14.3");
  const token = app.auth.createApiToken("Methods test", [...tokenScopes.manage]).token;
  const http = Bun.serve({hostname:"127.0.0.1", port:0, fetch: request => app.fetch(request)});
  const api = new OutpostApi({url:http.url.origin, token});
  const server = createMcpServer(api);
  const client = new Client({name:"methods-test",version:"1"});
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  const data = (value: Awaited<ReturnType<Client["callTool"]>>) => {
    const block = (value.content as Array<{type:string; text?:string}>)[0];
    if (!block?.text) throw new Error("Missing MCP text result");
    return JSON.parse(block.text);
  };
  try {
    await server.connect(peer); await client.connect(transport);
    const available = data(await client.callTool({name:"engines_get",arguments:{}}));
    expect(available.capabilities["sing-box"]).toContain("anytls");
    const args = {engine:"mihomo",protocol:"anytls",name:"Mihomo method",enabled:true,settings:{port:15443}};
    const created = await client.callTool({name:"method_create",arguments:args});
    expect(created.isError).not.toBeTrue();
    const method = data(created);
    const conflict = await client.callTool({name:"method_create",arguments:{...args,engine:"sing-box",name:"Other method"}});
    expect(conflict.isError).toBeTrue();
    const changed = await client.callTool({name:"method_update",arguments:{method_id:method.id,method:{...args,enabled:false}}});
    expect(changed.isError).not.toBeTrue();
    expect(applied).toEqual(["mihomo","mihomo"]);
    const state = data(await client.callTool({name:"methods_get",arguments:{}}));
    const ids = state.items.map((item:{id:string})=>item.id).reverse();
    expect((await client.callTool({name:"methods_reorder",arguments:{ids}})).isError).not.toBeTrue();
    expect(fixture.db.methods.list().map((item)=>item.id)).toEqual(ids);
    expect(applied).toHaveLength(2);
    expect((await client.callTool({name:"method_delete",arguments:{method_id:method.id}})).isError).not.toBeTrue();
    expect(fixture.db.methods.list().some((item)=>item.id===method.id)).toBeFalse();
    const reader = app.auth.createApiToken("Methods reader", [...tokenScopes.read]).token;
    const readApi = new OutpostApi({url:http.url.origin,token:reader});
    expect((await readApi.get<{items:unknown[]}>("/api/v1/methods")).items).toHaveLength(3);
    await expect(readApi.post("/api/v1/methods",args)).rejects.toThrow("403");
    await expect(readApi.post("/api/v1/engines/check")).rejects.toThrow("403");
    await expect(readApi.post("/api/v1/engines/mihomo/check")).rejects.toThrow("403");
  } finally {
    await client.close(); await server.close(); await http.stop(true); fixture.close();
  }
});
