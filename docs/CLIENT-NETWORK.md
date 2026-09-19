# Client network settings

The Settings page's **Device networking** card and the MCP tools
`settings_get` / `settings_update` use the same `/api/v1/settings` API.
Network settings are persisted in SQLite under `network`. Migration 4 seeds
the existing profile behavior with `INSERT OR IGNORE`; updating the application
does not reset the administrator's choices.

`PATCH /api/v1/settings` accepts partial objects. Omitted fields, including
nested Mihomo fields, retain their stored values. Unknown fields, invalid ports,
reversed ranges and empty port lists are rejected before any setting is written.
The actor and before/after settings are recorded in the audit log.

## Controls and delivery

| Setting | Default | Applies to |
| --- | --- | --- |
| `network.ipv6` | `false` | Full Mihomo, sing-box, Xray profiles and INCY routing subscription |
| `network.blockQuic` | `true` | UDP/443 rejection in full Mihomo, sing-box and Xray profiles |
| `network.mihomo.dnsMode` | `fake-ip` | Mihomo: `fake-ip` or `redir-host` |
| `network.mihomo.sniffing` | `true` | Mihomo domain detection |
| `network.mihomo.httpPorts` | `[80, "8080-8880"]` | Mihomo HTTP detection |
| `network.mihomo.tlsPorts` | `[443, 8080, 8443]` | Mihomo TLS detection, including Speedtest on 8080 |
| `network.mihomo.quicPorts` | `[443, 8443]` | Mihomo QUIC detection |

Port lists accept 1–64 integer ports or inclusive `start-end` strings in 1–65535.
Detection lists are retained when sniffing is disabled.

Enabling IPv6 removes Outpost's automatic `::/0` block. It also enables Mihomo's
IPv6 resolver and adds an IPv6 TUN address to the sing-box profile. Existing
administrator-authored routing rules retain their precedence. The setting does
not provision IPv6 on the server OS, change its inbound listener, or test IPv6
reachability. The administrator must have working IPv6 egress before enabling it.
Domain detection remains independent: an IPv6-capable server may still benefit
from hostname-based routing.

Changes affect the next response from existing subscription URLs; body changes
also change their ETags. Client apps must refresh **and apply** their profiles.
If a device does not refresh its subscription automatically, refresh it manually
and apply the changes. No server service restart or application release is
required to change these values. Raw connection URIs cannot carry
these profile settings. INCY routing does not support the UDP-port control or
Mihomo-specific settings.

## MCP

Read requires `settings:read`; write requires `settings:write`. New read/manage
tokens created in the panel include the corresponding settings scopes. Existing
tokens keep their existing permissions. Updating Outpost does not grant new
scopes to an old token.

Example `settings_update` arguments:

```json
{
  "network": {
    "ipv6": true,
    "blockQuic": false,
    "mihomo": { "tlsPorts": [443, 8080, 8443, "9443-9450"] }
  }
}
```

The locally installed `outpostctl mcp` must also be updated to expose the new
tools. A server update alone does not update a desktop CLI binary.

## Validation references

- [Mihomo DNS](https://wiki.metacubex.one/en/config/dns/)
- [Mihomo domain sniffing](https://wiki.metacubex.one/en/config/sniff/)
- [sing-box DNS](https://sing-box.sagernet.org/configuration/dns/)
- [sing-box TUN](https://sing-box.sagernet.org/configuration/inbound/tun/)
- [Xray DNS](https://xtls.github.io/en/config/dns.html)

Native validation covers the unchanged default profiles, dual stack with QUIC
allowed, custom TLS port ranges with Redir host, and dual stack with sniffing
disabled. Live IPv6 egress still requires a server with working IPv6; the
current HostKey field server is IPv4-only.
