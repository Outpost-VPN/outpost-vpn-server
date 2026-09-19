import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { OutpostApi } from "../shared/api";
import { createMcpServer } from "./mcp-tools";
import type { AuthService } from "./auth/webauthn";
import { config } from "./config";

const maxBodyBytes = 1024 * 1024;

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

  const body = await readBody(request);
  if (body instanceof Response) return body;

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

async function readBody(request: Request): Promise<unknown | Response> {
  if (Number(request.headers.get("content-length")) > maxBodyBytes) return failure(413, "MCP request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return failure(400, "Expected a JSON-RPC request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        return failure(413, "MCP request is too large.");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return failure(400, "Expected a JSON-RPC request.");
  } finally {
    reader.releaseLock();
  }
}

function failure(status: number, message: string, headers?: HeadersInit) {
  return Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}
