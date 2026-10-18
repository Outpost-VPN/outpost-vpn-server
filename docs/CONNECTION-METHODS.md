# Engines and connection methods

Implemented locally in `feat/protocol-expansion` on 2026-10-19. Release publication
and installation on live servers remain a separate stage.

## Model and ownership

An **engine** is an installed runtime with its own version, service and protected
base configuration. A **connection method** is a configured server listener:
identity, engine, protocol/transport, display name, enabled state, individual
settings and position. Several methods can use one engine; the same protocol can
have independent implementations on different engines and ports.

- `src/shared/connection-methods.ts` owns the input schema, verified server
  capabilities, settings defaults and client-profile capabilities.
- `ConnectionMethodStore` owns the persisted `connection_methods` setting and
  projects managed edge fields from server configuration. `ConnectionMethodService`
  encapsulates validation, runtime application, publication, audit and recovery.
  Its runtime callback is mandatory; read-only storage cannot bypass application.
- `EngineRuntimeService` renders the selected engine from the method snapshot and
  active credential generations. Method edits, connection lifecycle operations,
  engine installation and raw template edits share the connection snapshot lock.
- `method-listeners.ts` renders server listeners. `method-outbounds.ts` selects and
  renders compatible client endpoints. Both read the same method settings.
- `EngineInventory` remains the owner of installed/desired versions. Core
  installation no longer creates extra connection methods implicitly.

Migration runs once. It preserves the historical engine order and creates the
previous listeners for engines recorded as installed. Existing default subscription
fingerprints remain unchanged. An intentionally empty method list stays empty
across restarts. The old `engine_order` setting is migration input only; its API
and UI ordering path were removed. Historical journal entries remain readable.

User access stays in the existing connection/credential lifecycle. Adding a
listener creates no independent passwords or key generations.

## Supported server choices

These combinations were checked with the pinned runtimes in this branch:

| Engine | Server methods |
|---|---|
| Hysteria | Hysteria 2 |
| Xray | VLESS XHTTP, VLESS gRPC through the managed Nginx edge |
| Mihomo | Hysteria 2, VLESS XHTTP, VLESS gRPC, AnyTLS, TrustTunnel HTTP/2 |
| sing-box | Hysteria 2, VLESS gRPC, AnyTLS, Naive HTTP/2 |
| amneziawg-go | AmneziaWG 3.1 |

Methods support a name, public port, enabled state, transport path/service name
where applicable, and client TLS fingerprint for supported TLS transports. Other
runtime-wide settings remain in the protected engine configuration editor.

Mihomo and sing-box can have multiple independent listeners, including several
instances of the same protocol. TCP and UDP may share a numeric port. Conflicting
sockets, existing reserved service ports, duplicate client names and routing-policy
names such as `PROXY` are rejected before any runtime change.

The standalone Hysteria and AWG services each own one listener/interface. Xray
retains one listener per managed edge transport: its public port/path are derived
from the existing Nginx/server configuration and shown read-only. Extra XHTTP/gRPC
methods with independent ports/paths can use Mihomo or sing-box where supported.
TLS certificate identity remains the server's managed domain. Extra public TLS
ports require 1024–65535; this does not solve networks allowing only TCP/443.

Server parameter changes restart only the selected running engine, affecting its
methods. AWG uses peer/settings synchronization. Stopped engines remain stopped.
Names, client-only settings and priority changes do not require a runtime restart
when the rendered server config is unchanged. Runtime rejection leaves the stored
methods unchanged. If DB publication fails after successful application, the prior
runtime snapshot is reapplied; a SQLite trigger failure exercises this compensation.

Empty TLS listener lists never create passwordless access. With its method off,
standalone Hysteria binds loopback on an ephemeral port. AWG has no active peers
and uses an ephemeral port. Disabled managed Xray transports are omitted while
its local API remains available. Monitoring excludes disabled edge listeners from
availability incidents.

## Subscription compatibility

The common subscription page and user credentials remain stable. The selected
application/profile determines the supported method set; server engine names do
not determine client formats. For example, an AnyTLS listener on sing-box is
exported to a modern Mihomo client exactly like one on Mihomo.

The existing application profiles retain conservative capabilities. Explicit
modern profiles declare tested minimum core/build requirements, including Cronet
for Naive. User-Agent detection chooses an existing format, not an unverified core
version. Unknown client capabilities do not opt into advanced protocols.

The renderer intersects enabled methods, installed server engines and client
profile capabilities, preserving method priority. A client profile from a different
format is rejected. No compatible methods yields HTTP 409 with a localized stable
error code, rather than a broken or direct-only configuration.

The public catalog and owner connection dialog use the same capabilities and
actual server methods. Unavailable profiles are omitted. If only advanced/native
methods exist, the advanced section opens with guidance. Native Naive/AWG exports
select the first compatible method and do not carry Outpost routing policy.

## API and MCP

- `GET /api/v1/engines`: versions, runtime metadata and server capabilities.
- `GET /api/v1/methods`: configured methods, capabilities and proposed settings.
- `POST /api/v1/methods`: create using the shared input schema.
- `PATCH /api/v1/methods/:id`: replace settings; engine/protocol identity stays fixed.
- `DELETE /api/v1/methods/:id`: remove one method.
- `POST /api/v1/methods/reorder`: `{ ids: [...] }`, every current method exactly once.

Read operations require `engines:read`; mutations require `engines:write`.
MCP exposes `engines_get`, `methods_get`, `method_create`, `method_update`,
`method_delete` and `methods_reorder` through these same API endpoints. Engine
installation/update/start/stop continues through operation preview/confirmation.
MCP mutation descriptions identify the selected engine's interruption scope.

## Ingress, health and recovery

`runtimePorts` reads rendered configurations for listener health and public ingress.
Health includes local controllers/APIs and checks listener ownership in the selected
systemd cgroup. Default ports in the release catalog are not used as current state.

`engine-firewall` atomically replaces an engine's own `OUTPOST_IN_*` IPv4 chain
inside UFW. It preserves other UFW rules and sibling engines. Port edits remove
old owned ingress; empty configurations close it. Invalid input is rejected before
replacing the current chain. Existing historical UFW rules are preserved.
`outpost-firewall.service` restores owned rules after UFW at boot; engine units
want it without making legacy required runtimes depend on a new script during
rollback. The updater snapshots managed unit files and restores them on rollback.

The method setting is included in the existing SQLite backup. Restore/runtime
reconciliation renders from that authoritative state. Config rollback restores
base templates with current methods rather than resurrecting obsolete listeners.

## Verification

- 117 targeted tests across method ownership, subscriptions, presets, engines,
  connection synchronization, API, catalog, monitoring, operations, settings, i18n,
  journal and MCP passed. All five legacy subscription goldens remain unchanged.
- Targeted TypeScript entry-point checks, quick Imba compilation, Go policy/agent
  tests and shellcheck passed. No whole-project gate or production release build
  was run for this local feature.
- Native Hysteria/AnyTLS/TrustTunnel/Naive transfers still passed. Additional native
  tests passed for Hysteria on Mihomo and sing-box, AnyTLS on sing-box, XHTTP on
  Mihomo, and gRPC on Mihomo/sing-box, with individually configured ports, verified
  TLS and rejected wrong credentials. Headless Hysteria also started successfully.
- The native Mihomo parser demonstrated a `PROXY` name causing a routing loop;
  method validation now prevents that configuration.
- A dedicated disposable Ubuntu VM tested actual incoming traffic in a network
  namespace: port changes, closure on empty config, preservation after invalid
  input, unrelated UFW rules and regeneration through systemd.
- Browser checks exercised separate engine installation in demo, engine/protocol
  selection, two AnyTLS implementations with independent ports, rejected socket
  conflicts and method priority changes. Screenshots/logs are ignored `.cache/`
  artifacts; the local demo contains no live server data.

The signed Linux amd64 release/update/restore smoke test and live FAMLES/hotel
comparison remain release/field work. These checks do not prove censorship bypass.
