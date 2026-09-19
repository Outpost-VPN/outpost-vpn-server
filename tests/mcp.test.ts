import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/cli/mcp";
import { OutpostApi } from "../src/cli/api";
import { HttpApplication } from "../src/server/http";
import { database } from "./helpers";

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
