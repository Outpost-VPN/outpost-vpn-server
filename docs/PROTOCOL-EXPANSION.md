# Protocol expansion

Prepared for `0.2.0-beta.7`, based on `c2d0b0b` (`0.2.0-beta.6`).
Local implementation and targeted validation completed on 2026-10-19. No signed
release has been built or published; no live server or active client was changed.

The subsequent [engine/method model](CONNECTION-METHODS.md) separates runtime
management from configurable listeners and client capabilities.

## Runtimes and ports

Versions were selected from upstream releases on 2026-10-18 and pinned by SHA-256.
They are reproducible selections, not an automatic “latest” policy.

| Runtime | Version | Transports | Default ports |
|---|---|---|---|
| Hysteria | 2.13.0 | Hysteria 2 | UDP 443 |
| Xray | 26.10.17, upstream prerelease | VLESS XHTTP / gRPC through existing Nginx | TCP 443 |
| Mihomo, optional | 1.19.32 | AnyTLS, TrustTunnel HTTP/2 | TCP 1443, 2443 |
| sing-box, optional | 1.14.3 | Naive HTTP/2 | TCP 3443 |
| amneziawg-go / tools, optional | 3.1.20260828 / 3.1.20260812 | AmneziaWG 3.1 | UDP 51820 |

The additional TLS ports avoid Nginx and the unrelated TCP/8443 service. A network
that permits only TCP/443 can still block all these added TCP endpoints. Moving
them to TCP/443 would need a separate edge/address design. No result here proves a
bypass of FAMLES, hotel filtering, or a particular TSPU rule.

Existing required runtimes remain installed by default. Additional runtimes are
installed individually through the engine tab; listeners are added separately, with verified downloads,
configuration validation, service-owned listener checks, and rollback. An update
of an installed but stopped runtime preserves its stopped state. Uninstalled
optional runtimes are shown as absent and do not make server health fail.

## Client profiles

With migrated default methods, existing application subscriptions retain their
original transports and routing behavior. Configured method changes apply to
these profiles according to their client capabilities. Their five golden outputs are unchanged. Updating one of these
subscriptions alone does not opt an old client into unsupported protocols.

After installing a runtime, open a connection's public page, choose **For advanced
users**, and import a profile compatible with the client's actual core:

| Profile | Client requirement | Added transports |
|---|---|---|
| Modern Mihomo YAML | AnyTLS: Mihomo ≥1.19.4; TrustTunnel: ≥1.19.21; AWG 3.1: ≥1.19.31 | AnyTLS, TrustTunnel, AmneziaWG 3.1 |
| Modern sing-box JSON | AnyTLS: sing-box ≥1.12.0; Naive: ≥1.13.0 with Cronet | AnyTLS, Naive |
| AmneziaWG `.conf` | AmneziaVPN 5.0.1.5 or newer / compatible AWG 3.1 client | AmneziaWG 3.1 |
| Naive JSON | Native NaiveProxy or a compatible Naive client | Naive HTTP/2 |

Modern Mihomo/sing-box profiles also include their supported legacy transports
and Outpost routing rules. Native AWG and Naive files do not include Outpost route
policy. Naive is not a native Mihomo outbound; sing-box builds may need the
platform-specific Cronet library. A GUI app's name/version does not establish its
bundled core or available build features. Generated profiles omit transports
whose runtime is not installed; native-only exports return a clear conflict until
installation and configuration of a compatible method.

Catalog v7 exposes explicit modern app profiles and per-protocol version requirements
on the subscription page; see [client compatibility](CONNECTION-METHODS.md#client-version-requirements).
The bundled server versions above remain the versions used for native integration;
they are separate from these client protocol requirements.

Refresh and apply subscriptions on devices after server/client configuration
changes. AmneziaWG native files must be reimported after credential rotation.

## Owners and lifecycle

- `agent/internal/policy/engines.json` owns engine IDs, services, config filenames,
  protocol ports, versions, checksums and source assets. TypeScript imports it;
  Go embeds it; shell installers query the compiled CLI.
- `EngineInventory` owns installed/desired versions and absence. Restoring a DB
  recovers actual versions from managed host links rather than trusting historical
  optional-installation rows.
- `engine-presets.ts` / `engines.ts` own protected templates, revisions, rendering
  and preset reconciliation. Uninstalled optional engines produce no config files.
- Existing encrypted `ConnectionService` credential generations remain the source
  of truth. Domain-separated HMACs derive distinct TLS passwords and AWG client
  keys/PSKs. AWG server identity and obfuscation settings derive from the backed-up
  master key. No parallel secret lifecycle was added.
- `EngineRuntimeService` and the existing connection outbox synchronize installed
  optional engines on create, rotate, suspend, resume and archive. Full snapshots,
  engine installation and configuration application share one lock through the DB
  transition. Recovery renders active credentials before restarting services.
- `protocols.ts` / `subscriptions.ts` own renderer capabilities. The shared engine
  presentation is used by both protocol views and the configuration editor.

Empty connection lists never produce passwordless TLS listeners. Native AWG
input is a strict snapshot schema, not arbitrary `PostUp`/shell directives. Peer
updates use `awg syncconf` without restarting the interface. It owns the
`outpost-awg` interface, `10.78.0.0/16`, and explicit forwarding/NAT rules. Existing
interface, overlapping routes or chain ownership cause refusal before cleanup can
touch other resources. Private destinations, server services and UDP/443 egress
are rejected. Native exports capture IPv4/IPv6 routes; the tunnel forwards IPv4
only and blocks IPv6 egress.

TLS services use the existing certificate renewal hook. Backups include only
catalogued active configs and environment, excluding `.previous` files. Restore
accepts the optional configs and reconciles them against installed binaries and
restored active credentials. Application update rollback snapshots optional
configs and preserves inactive services.

## User telemetry

All five runtimes contribute to total traffic and combined presence per Outpost
connection. Mihomo/sing-box use approximate session snapshots; failed or missing
telemetry produces unknown activity rather than a false offline result. See
[user telemetry](USER-TELEMETRY.md) for sampling, persistence and runtime contracts.
No per-protocol usage breakdown is exposed.

## Packaging

The signed application archive bundles userspace AWG binaries, upstream licenses,
source archives and source provenance. Both immutable upstream commits are pinned
in `infra/amneziawg-sources.json`; no kernel module or build tool is installed on
the VPS. Hysteria, Xray, Mihomo and sing-box downloads are checksum-verified. The
ordinary Minisign release and panel-install process remains authoritative.

## Validation completed

Only checks targeted at the changed behavior were used; no full project gate or
production release build was run.

- Subscription golden tests: all five legacy fingerprints unchanged; generated
  legacy and modern profiles accepted by the pinned native cores, including the
  Mihomo AWG 3.1 profile.
- Targeted tests cover credential separation/rotation, strict AWG rendering,
  optional installation/version recovery, no-passwordless-listener behavior,
  renderer compatibility, connection lifecycle, recovery, presets, API, catalog,
  monitoring, operations, traffic/presence, i18n and release contracts. The final
  protocol/i18n/release selection passed 43 tests.
- Targeted TypeScript entry-point checking, Go policy/agent tests, shellcheck of
  changed root scripts and a quick Imba compilation passed. Preview showed all
  five engines, correct absent-engine status, config editors and profile guidance.
- Real Hysteria 2.13.0, AnyTLS, TrustTunnel and Naive transfers passed with TLS;
  wrong passwords were rejected. Existing XHTTP/gRPC/fallback passed through one
  TLS edge with Xray 26.10.17 and Mihomo 1.19.32.
- In a dedicated disposable Ubuntu 24.04 ARM64 Lima VM, AWG native and Mihomo
  1.19.32 clients transferred traffic with AWG 3.1 header protection, random
  trailers and disabled cookies. NAT, private-network rejection, peer revoke/
  rotate without server restart, empty configs and overlapping-route refusal
  were exercised.
- That VM exercised optional-runtime installation, service-owned listener health,
  stopped-engine preservation and failed-update rollback without changing other
  runtime PIDs. Its source copy used official ARM assets; production catalog pins
  remain Linux amd64. AWG source compilation succeeded there.
- Backup export and `restore --check` accepted all five config types and excluded
  transient `.previous` files. This was not a complete restore/downtime test.

Linux logs were copied into ignored `.cache/` artifacts; the VM and temporary
Preview backend/tab were removed after validation.
The user’s existing Lima instances and active Mac tunnel are outside these tests.

## Release and field work still required

1. Prepare the next signed release on the Linux amd64 runner, run the project's
   required release checks, and verify bundled source/license files.
2. The release workflow tests the assembled archive on a disposable Linux amd64
   host before production signing/publication. It verifies a signed beta.4
   baseline, uses a disposable test key for the exact new archive bytes, applies
   the legacy updater, and performs a full backup restore. Owner/passkey data,
   existing credentials, subscription and API-token continuity, SQLite integrity,
   destination-IP preservation and unchanged Hysteria/Xray PIDs are checked.
   These fixtures do not replace live optional-protocol and client tests.
3. Install through the panel under the normal service-availability procedure;
   then install the selected optional runtimes and import compatible profiles.
4. Compare each transport on FAMLES and the failing hotel network with sustained
   transfers, fresh sessions, wrong-password controls and a working mobile path.
   The filtering mechanism and long-term bypass remain unproven.

## Primary references

- [Hysteria 2.13.0](https://github.com/HyNetworks/hysteria/releases/tag/app/v2.13.0)
- [Xray 26.10.17 prerelease](https://github.com/XTLS/Xray-core/releases/tag/v26.10.17)
- [Mihomo 1.19.32](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.32)
- [AnyTLS listener](https://wiki.metacubex.one/en/config/inbound/listeners/anytls/)
- [TrustTunnel listener](https://wiki.metacubex.one/en/config/inbound/listeners/trusttunnel/)
- [Mihomo WireGuard/Amnezia options](https://wiki.metacubex.one/en/config/proxies/wg/)
- [sing-box 1.14.3](https://github.com/SagerNet/sing-box/releases/tag/v1.14.3)
- [Naive inbound](https://sing-box.sagernet.org/configuration/inbound/naive/)
- [Naive outbound](https://sing-box.sagernet.org/configuration/outbound/naive/)
- [amneziawg-go sources](https://github.com/amnezia-vpn/amneziawg-go/tree/v3.1.20260828)
- [amneziawg-tools sources](https://github.com/amnezia-vpn/amneziawg-tools/tree/v3.1.20260812)
- [AmneziaVPN 5.0.1.5](https://github.com/amnezia-vpn/amnezia-client/releases/tag/5.0.1.5)
