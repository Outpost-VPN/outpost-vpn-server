# Direct MCP connection

Outpost exposes MCP at `https://<your-domain>/api/v1/mcp` on the existing HTTPS
port 443. Use a client that supports **Streamable HTTP** and a **Bearer token**
or an `Authorization` header. No local Outpost process, Bun installation, or
platform-specific MCP binary is needed on Windows, macOS, Linux or other client
platforms. Clients that require OAuth-only login are not supported by this
API-token authentication flow.

1. Open **Access → API / MCP** in the Outpost panel.
2. Copy the MCP address and create a token with read or manage permissions.
3. In the AI application, select Streamable HTTP, paste the address and provide
   the token as a Bearer token, or set `Authorization: Bearer <token>`.

Tokens are displayed once. Give each application its own token and revoke it
in Access when no longer needed. Existing scoped API tokens work unchanged;
capabilities are limited to their current permissions. Never put a token in
the URL or in a shared project configuration.

For example, Codex can read the token from the environment of the Codex process:

```toml
[mcp_servers.outpost]
url = "https://proxy.example.com/api/v1/mcp"
bearer_token_env_var = "OUTPOST_TOKEN"
```

Other clients may expose a Bearer token field or a custom headers editor.
No `command`, `args`, `npx`, or `outpostctl mcp` process is required.

## Tools and permissions

| Tools | Required permissions |
| --- | --- |
| `outpost_status` | `status:read` |
| `settings_get`, `settings_update` | `settings:read`, `settings:write` respectively |
| `traffic_get` | `traffic:read` |
| `connections_list`, `connection_create` | `connections:read`, `connections:write` respectively |
| `connection_subscription` | `connections:secret` |
| `routes_get` | `routes:read` |
| `route_add`, `routes_publish` | `routes:write` |
| `operation_preview`, `operation_confirm` | `operations:write` |
| `connection_rotate` and confirmation of `connection.rotate` | `operations:write` and `connections:rotate` |

Tool calls dispatch to Outpost's existing API inside the server, retaining
validation, scopes, audit actors, and the preview/confirmation contract for
sensitive operations. Network settings are described in
[CLIENT-NETWORK.md](CLIENT-NETWORK.md). They apply to the next subscription
response; devices still need to refresh and apply their profiles.

## Transport and deployment

The endpoint uses stateless JSON responses over Streamable HTTP. Every POST
has its own authenticated context; no MCP session survives between requests,
so there is no session to lose during an application restart. GET/SSE, DELETE
and other methods return 405. Standard clients must accept both JSON and SSE
as required by Streamable HTTP, even though Outpost responds with JSON.

Authentication is checked on every request, including discovery and tool
listing. Revoked and expired API tokens fail immediately. Browser session
cookies and tokens in query strings do not authenticate MCP. A supplied Origin
must match `OUTPOST_ORIGIN`; the Host must match its authority. No cross-origin
browser CORS access is granted. Bodies are limited to 1 MiB, including requests
without Content-Length, and responses use `Cache-Control: no-store`.

MCP is unavailable in demo mode and during initial setup. The existing domain
Nginx `/api/v1/` route provides TLS, request rate limits and disabled access
logging; no new listener, firewall port, or Nginx route is required. Keep
`OUTPOST_ORIGIN` set to the public HTTPS origin and forward its Host header
when using a custom reverse proxy.

The old stdio MCP command and desktop CLI builds were removed in beta.4.
The Linux `outpostctl` in the server archive remains the maintenance tool used
by installation, migrations, recovery and updates; it has no MCP mode.

References: [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[Codex MCP configuration](https://developers.openai.com/codex/mcp/).
