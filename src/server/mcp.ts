import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { OutpostApi } from "../shared/api";
import { createMcpServer } from "./mcp-tools";
import type { AuthService } from "./auth/webauthn";
import { config } from "./config";
import {readJsonBody} from "./http-body";
import {ServiceError} from "./services/connections";

export async function handleMcp(request: Request, auth: AuthService, dispatch: (request: Request) => Promise<Response>) {
  if (config.demo || config.setup) return failure(404, "MCP is unavailable during setup or in demo mode.");

  const address = new URL(config.origin);
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const origin = request.headers.get("origin");
  if (host !== address.host || (origin !== null && origin !== address.origin)) {
    return failure(403, "Invalid MCP host or origin.");
  }
  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token || !auth.authenticateApiToken(token)) {
    return failure(401, "A valid Outpost API token is required.", { "www-authenticate": 'Bearer realm="Outpost MCP"' });
  }
  // This endpoint uses stateless JSON responses; it has no SSE session to open or delete.
  if (request.method !== "POST") return failure(405, "Use POST for MCP requests.", { allow: "POST" });

  let body: unknown;
  try {body = await readJsonBody(request);} catch (error) {
    return error instanceof ServiceError && error.status === 413 ? failure(413, "MCP request is too large.") : failure(400, "Expected a JSON-RPC request.");
  }

  // Dispatch through the same scoped API as the panel. Never forward
  // cookies or take an upstream URL from the client; each request has its own token.
  const api = new OutpostApi({ url: config.origin, token }, dispatch);
  const server = createMcpServer(api);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: body });
    response.headers.set("cache-control", "no-store");
    return response;
  } finally {
    await server.close();
  }
}

function failure(status: number, message: string, headers?: HeadersInit) {
  return Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}
