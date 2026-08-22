# Outpost

Outpost is a self-hosted proxy management panel for one owner. It deploys and
maintains two proxy stacks on a single domain, provides universal Mihomo,
sing-box, and Xray subscriptions, publishes shared routing rules, and tracks
traffic by connection without storing browsing history. Every connection has
one credential generation and one link that may be shared by any number of
people and physical devices.

> **Status:** `0.1.0-rc.17` pre-release. Local tests and production builds pass;
> the signed release passes a clean Ubuntu VPS installation, with the remaining
> end-to-end field gate tracked in [STATUS.md](STATUS.md).

## Supported protocols

Outpost currently supports:

- **Hysteria 2** on `UDP/443` as the primary connection.
- **VLESS over XHTTP and TLS**, powered by Xray-core, as the preferred TCP fallback.
- **VLESS over gRPC and TLS** as the compatibility TCP fallback.

All TCP transports share public `TCP/443` through Nginx. Subscription renderers
produce Mihomo YAML, sing-box JSON, Xray URI base64, full Xray JSON, and a plain
link list.

## Architecture

```text
UDP/443 → Hysteria 2
TCP/443 → Nginx → secret XHTTP path → Xray on localhost
                 → secret gRPC service → Xray on localhost
                 → admin/API and /s subscriptions → Outpost on localhost
                 → all other requests → neutral fallback page
```

- The web interface is written in Imba and built with `bimba`.
- The control plane uses Bun, TypeScript, and SQLite.
- Privileged operations are handled by a minimal allowlisted Go agent.
- `outpostctl` provides a CLI and a local MCP server.
- Nginx, Hysteria 2, and Xray run as separate systemd services.
- Mutable settings and revisions live in SQLite, independently of release
  directories.
- Connection activation, rotation, and archival are synchronized with Xray through a
  persistent SQLite outbox.
- Signed GeoIP/Geosite SRS bundles are published separately and updated
  atomically with two rollback versions retained on each server.
- Release archives are signed with Minisign, and signatures are verified before
  installation or updates.

For more details, see the documentation for
[architecture](docs/ARCHITECTURE.md),
[development](docs/DEVELOPMENT.md),
[deployment](docs/DEPLOYMENT.md), and
[security](docs/SECURITY.md).

## Installation and running

### Install on a server

You need a clean Ubuntu 24.04 amd64 server with a public IPv4 address and
available ports `TCP/80`, `TCP/443`, and `UDP/443`.

Run the following command in your VPS web console:

```bash
curl -fsSLo /tmp/outpost-install https://raw.githubusercontent.com/Outpost-VPN/outpost-vpn-server/main/infra/scripts/bootstrap && sudo bash /tmp/outpost-install
```

The installer downloads the latest GitHub Release, verifies its detached
Minisign signature, installs only the required packages, starts Outpost, and
obtains a short-lived trusted Let's Encrypt certificate for the server's IP
address. It does not perform a full Ubuntu upgrade or reboot the server.

When the installation finishes, it prints `https://<IP>/`. Open that fixed
address in a browser, choose a free hostname or your own domain, and follow the
setup flow. Outpost shows the required DNS `A` record, waits for DNS propagation,
issues the final domain certificate, and then hands the same browser over to the
permanent domain to configure owner access with a passkey.

The installer is intentionally limited to a clean VPS. If TCP 80, TCP 443, or
UDP 443 is already occupied, it stops before changing the server. Installing
beside existing services or selecting alternative public ports is not supported.

To install a specific release candidate instead of the latest stable release:

```bash
curl -fsSLo /tmp/outpost-install https://raw.githubusercontent.com/Outpost-VPN/outpost-vpn-server/main/infra/scripts/bootstrap && sudo env OUTPOST_VERSION=0.1.0-rc.17 bash /tmp/outpost-install
```

See the [deployment guide](docs/DEPLOYMENT.md) for developer deployment,
updates, and recovery procedures.

### Run locally

Local development requires Bun `1.3.13` and Go `1.25` or newer.

```bash
git clone https://github.com/Outpost-VPN/outpost-vpn-server.git
cd outpost-vpn-server
bun install --frozen-lockfile
bun run check
bun run dev
```

The panel starts with demo data at <http://localhost:8181/admin/>. The interactive
pre-launch preview is available at
<http://localhost:8181/admin/?preview=setup>.

## Repository structure

- `src/web/` — Imba web interface.
- `src/server/` — Bun/TypeScript API, SQLite storage, authentication, and
  services.
- `src/cli/` — CLI and local MCP server.
- `agent/` — minimal privileged Go agent.
- `infra/` — Nginx and systemd configuration, installation, and update scripts.
- `assets/` and `public/` — source and compiled web assets.
- `tests/` — control-plane unit and integration tests.
- `docs/` — architecture, development, deployment, and security documentation.

## License

Outpost is licensed under the [GNU AGPL-3.0-only](LICENSE). See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party dependency
notices.

## Naming

The public project name is always written as `Outpost`. The package and GitHub
repository use `outpost-vpn-server`. Services, CLI tools, data directories, and
environment variables use the `outpost*` and `OUTPOST_*` prefixes. There are
no legacy aliases.
