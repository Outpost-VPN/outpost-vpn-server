# Engines and connection methods

Implemented locally in `feat/protocol-expansion` on 2026-10-19. Release publication
and installation on live servers remain a separate stage.

## Model and ownership

An **engine** is an installed runtime with its own version, service and protected
base configuration. A **connection method** is a configured server listener:
identity, engine, protocol/transport, display name, enabled state, individual
settings and position. Several methods can use one engine; the same protocol can
have independent implementations on different engines and ports.

The sidebar provides separate **Protocols** (`/admin/protocols`, configured
connection methods) and **Engines** (`/admin/engines`, runtimes) pages. Russian UI
uses «Движки». Methods show a green/red service state beside their title, compatible
client families/required versions. An information tooltip explains route delivery
for that method: complete Mihomo/sing-box/Xray subscription profiles include Outpost
rules; individual URI links do not. Link subscriptions provide routing separately,
which requires client support; NaiveProxy and AmneziaVPN native exports do not carry
Outpost rules. This metadata lives in the shared client-profile catalog. Cronet is
required for Naive, not for an AnyTLS-only sing-box profile.

The drag handle replaces priority numbers/arrows and also supports keyboard arrows.
`Reorder` owns gestures, hit testing, motion and cancellation for both methods and
routes; each list owns its draft and persistence. Protocol order is saved on drop;
routes retain their separate draft/publish contract and pinned system boundaries.
All five engines contribute to per-user totals and combined activity; see
[user telemetry](USER-TELEMETRY.md). Traffic details are not repeated in method rows.

Each engine has its own version-check icon and an install/update icon next to its
version. Engine updates are independent of panel releases: official release assets
use published SHA-256 digests, and AWG uses standalone signed runtime bundles.
The root installer re-verifies the known source and downloaded file, validates the
configuration and rolls back on failure. See [independent engine updates](INDEPENDENT-ENGINES.md)
for trust, packaging and recovery contracts. Local official logo sources are recorded
in `assets/engines/SOURCES.md`.

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

VLESS Base64 export has been removed. The universal URL selects full Xray JSON for
Xray/v2rayN/v2rayNG and routing-aware links for INCY/Happ. Unknown clients receive
the application catalog to choose a supported profile, rather than a link-only
fallback that silently drops routing rules.

The renderer intersects enabled methods, installed server engines and client
profile capabilities, preserving method priority. A client profile from a different
format is rejected. No compatible methods yields HTTP 409 with a localized stable
error code, rather than a broken or direct-only configuration.

The public catalog and owner connection dialog use the same capabilities and
actual server methods. Unavailable profiles are omitted. If only advanced/native
methods exist, the advanced section opens with guidance. Native Naive/AWG exports
select the first compatible method and do not carry Outpost routing policy.

Catalog v8 derives method names, per-protocol client requirements and route support
through `profileSupport` for applications and manual profiles. `ApplicationProfile`
owns the app's allowed protocols, profile validation, URLs, QR target and requirements.
The same selection drives the public card, owner dialog and actual renderer.
`renderCompatibility` and `public/client-compatibility.css` own the compatibility
block in public cards, the owner dialog and manual profiles. Protocol requirements
appear in hover/keyboard-focus hints on the protocol badges. Route support and
automatic/manual refresh share one block; route limitations use the same hints.
The Imba views reactively insert this escaped markup rather than reimplementing
its labels, selection or tooltips. Manual profiles keep a separate copy button so
the hint triggers are not nested inside a button.
App-specific requirements override core requirements where the app uses its own
implementation, such as Stash. After filtering, full route support comes first,
then the number of distinct configured compatible protocols, then the existing
platform preference. Duplicate listeners do not increase that count. The first
three apps fill the primary slots; the remainder appear below. The catalog owns
this ranking and supplies `orderFor` to the owner dialog for the same platform order.

Cards choose a `?profile=modern` link when it adds configured, supported protocols.
Copy, import and QR use this same link. Existing app URLs and universal subscriptions
keep their conservative profile, so older installed clients are not silently given
new protocol types. Modern profile parameters are validated against the chosen app;
they cannot enable capabilities assigned to another app. sing-box for Apple is now
listed on iOS as well as macOS, using the official sing-box MT App Store listing.

Clash Mi is listed on all five platforms, with its official iOS App Store link and
GitHub releases for desktop/Android. Its `clashmi://install-config?url=…` scheme
targets Clash Mi directly and is shared by import and QR. It consumes the existing
Mihomo renderer, including ordered Outpost rules; per-profile rule/group overrides
and added Apple push rules default to off. Scheduled subscription updates default
to 24 hours and prefer the server's `profile-update-interval` (Outpost: 12 hours).
No global override mode is forced: the app retains its platform networking setup.
AnyTLS/TrustTunnel use the shared modern requirements; AWG remains excluded pending
confirmation of the bundled core. Sources checked on 2026-10-19:
[platforms and downloads](https://github.com/KaringX/clashmi),
[scheme handler](https://github.com/KaringX/clashmi/blob/main/lib/screens/scheme_handler.dart),
[profile defaults](https://github.com/KaringX/clashmi/blob/main/lib/app/modules/profile_manager.dart),
[subscription import](https://github.com/KaringX/clashmi/blob/main/lib/screens/add_profile_by_url_screen.dart),
[override behavior](https://clashmi.app/guide/faq).

### Client version requirements

Verified from official documentation/source on 2026-10-19. Core version means the
engine **inside the client**, independently of the server engine version. Where an
application does not publish a minimum GUI version, the UI states the core version
to check rather than inventing an application version.

| Protocol | Clients/profile | Requirement |
|---|---|---|
| AnyTLS | Everywhere, Clash Mi, Clash Verge Rev, Clash Party, Clash Meta for Android, FlClash | Mihomo ≥1.19.4 (AnyTLS protocol v2) |
| AnyTLS | Official sing-box clients | sing-box ≥1.12.0 |
| AnyTLS | Stash | iOS ≥3.3.0 / macOS ≥4.1.0 |
| TrustTunnel | Mihomo-based profiles | Mihomo ≥1.19.21 |
| TrustTunnel | Stash | iOS ≥3.4.0 / macOS ≥4.2.0 |
| Naive | Official sing-box clients | sing-box ≥1.13.0 with Cronet |
| AmneziaWG 3.1 | Clash Verge Rev, Clash Party, Clash Meta for Android, FlClash | Mihomo ≥1.19.31, including the AWG 3.x flag fixes |

Stash profiles exclude AWG, and Everywhere/Clash Mi offered Mihomo profiles exclude AWG
pending confirmation of the bundled version. Native NaiveProxy JSON is a separate
format from sing-box JSON; its requirement no longer incorrectly names sing-box.
Mihomo/sing-box modern profiles include routes; native exports retain their existing
route limitations. Requirements are derived only for protocols present in the profile.

Sources: [Mihomo AnyTLS v2](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.4),
[TrustTunnel](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.21),
[AWG fixes](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.31),
[sing-box AnyTLS](https://sing-box.sagernet.org/configuration/outbound/anytls/),
[sing-box Naive/Cronet](https://sing-box.sagernet.org/configuration/outbound/naive/),
[Stash iOS](https://stash.wiki/en/release-notes/ios),
[Stash macOS](https://stash.wiki/en/release-notes/macos),
[Everywhere engines](https://github.com/NodePassProject/Everywhere),
[Clash Verge](https://github.com/clash-verge-rev/clash-verge-rev/releases),
[Clash Party packaging](https://github.com/mihomo-party-org/clash-party/blob/v2.0.4/scripts/prepare.mjs),
[FlClash pinned core](https://github.com/chen08209/FlClash/tree/v0.9.1/core/Clash.Meta),
[Clash Meta pinned core](https://github.com/MetaCubeX/ClashMetaForAndroid/tree/main/core/src/foss/golang/clash).

App imports are declared compatible from these sources and generated-profile checks;
this does not claim a manual device test on every listed GUI release.

Link-routing contracts were checked against the official
[INCY autorouting documentation](https://github.com/INCY-DEV/incy-docs/blob/main/ru/dev-docs/autorouting.md)
and [Happ routing documentation](https://www.happ.su/main/dev-docs/routing)
on 2026-10-19. INCY requires the full `incy://autorouting/onadd/` prefix in its
header; a bare URL is ignored. Happ receives its documented routing line in the
subscription body, avoiding large HTTP headers for expanded rule sets. Published
rule changes therefore also change the response ETag through the existing body
hash. Both consume the same grouped routing payload; exact rule order is preserved
by full Mihomo/sing-box/Xray profiles only.

## API and MCP

- `GET /api/v1/engines`: versions, runtime metadata and server capabilities.
- `POST /api/v1/engines/:engine/check`: check one engine without installation.
- `POST /api/v1/engines/check`: compatible batch check endpoint.
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
`engines_check` exposes version discovery and requires `engines:write`; a read-only
engine token cannot trigger network checks or mutate their cached state.

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
