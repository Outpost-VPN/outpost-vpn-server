import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/server/mcp-tools";
import { OutpostApi } from "../src/shared/api";
import { HttpApplication } from "../src/server/http";
import { database } from "./helpers";
import { tokenScopes } from "../src/shared/api-scopes";

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
