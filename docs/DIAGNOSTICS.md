# Diagnostic API and MCP

Diagnostics share the normal authenticated API, operation persistence and resource
sampler. They never alter system routing, production client profiles or engine
configuration while running. They do generate bounded test traffic.

## Tools

| MCP tool | API | Scope |
| --- | --- | --- |
| `system_metrics_get` | `GET /api/v1/system/metrics` | `system:read` |
| `connection_diagnostics_get` | `GET /api/v1/connections/:id/diagnostics` | `connections:read` |
| `events_get` | `GET /api/v1/system/events` | `system:read` |
| `operations_get` | `GET /api/v1/operations[/:id]` | `operations:read` |
| `diagnostic_run` | `POST /api/v1/diagnostics` | `diagnostics:run` |
| `diagnostic_get` | `GET /api/v1/diagnostics/:id` | `diagnostics:read` |
| `diagnostic_cancel` | `POST /api/v1/diagnostics/:id/cancel` | `diagnostics:run` |

Read/manage token presets include the new diagnostic read/run scopes. Existing
tokens keep their original permissions; issue an appropriately scoped token in
the panel after installing the release. Raw system state, transport secrets,
credentials and arbitrary journald text are not exposed by these reads.

`connection_diagnostics_get` takes `connection_id` and optional `includeEvents`.
It returns the existing per-engine presence, its signal (`connections` or recent
`traffic`), collector health/error, timestamp, sample age and stale status. With
`includeEvents=true`, the agent reads newest first, at most 1000 managed-service
journal lines / 512 KiB from the past hour, requesting only message and timestamp
fields. It returns up to 25 latest normalized events/groups per engine in
chronological order. Grouping happens before the event limit. Reaching a line,
byte or event budget preserves
collected events with `truncated=true`; an actual journal failure is unavailable.
String and numeric byte-array `MESSAGE` fields use the same event normalizer;
journalctl uses byte arrays for messages containing ANSI control bytes. Invalid
messages and non-UTF-8 byte arrays are skipped. ANSI and raw message fields stay
inside the privileged agent.
Events require a structured user
identity in the engine log; an empty result is not proof of no disconnect. Current
Hysteria logs provide this identity. Requested sites and client addresses are
discarded inside the privileged agent.

Each event has numeric `sampledAt` (milliseconds), `engine`, `type`, `reason`,
`level` and `count`. `type` describes the event (`connected`, `disconnected`,
`error`); it is not severity. `level` preserves the source severity: `debug`,
`info`, `warn`, `error`, `dpanic`, `panic` or `fatal`; absent/unrecognized levels
are `unknown`. Console ANSI messages and structured JSON share one normalizer.
Reasons use the error/heading, never destination or credential fields:

- `client_cancelled_stream`: a stream cancelled by the remote client. This does
  not itself mean the VPN session ended; Hysteria uses code 0 for ordinary stream
  cleanup. Severity is preserved even for nonzero cancellation codes.
- `upstream_connect_timeout`: an outbound `dial tcp` I/O timeout. Other I/O
  timeouts retain `transport_error` rather than guessing the failed phase.
- `idle_timeout`, `authentication_failed`, `connection_reset`, `connected`,
  `closed` and the fallback `transport_error` retain their existing meanings.

An observed `disconnected/idle_timeout` groups related TCP/UDP idle warnings
within one second before/after that disconnect, using the private client endpoint
only inside the agent. A reconnect is a hard boundary. Distinct endpoints,
ambiguous disconnects, missing endpoints/roots and other reasons stay separate.
This is bounded journal correlation, not a persistent QUIC session identifier.
For a group, `sampledAt`, `type`, `reason` and `level` describe the disconnect;
`count` includes that root and its consequences. `firstSampledAt`/`lastSampledAt`
give the observed time span, and `related` contains `{type, level, count}` summaries
of the consequences, preserving their original levels. All related events share
the root's `idle_timeout` reason. A standalone event has `count: 1` and omits group
fields. No client endpoint, hash, destination, raw error or credential is returned.
Counts cover only the bounded captured records; `truncated=true` may indicate a
partial group/window. The application journal from `events_get` is separate.

`events_get` filters the Outpost application journal by `from`, `to` (UTC ISO),
`engine`, `connectionId`, `scope`, `q`, `before`, and `limit` (1–100).
`traffic_get` also accepts `connectionId`, `from`, `to`, `includeSeries`,
`resolution` (`auto`, `5m`, `1h`, `1d`) and `maxPoints` (1–1000; default 200).
Totals cover the full requested range. Automatic resolution coarsens buckets to
bound response size; explicit excessive detail is rejected rather than truncated.
Storage retains 5-minute samples for 48 hours and hourly samples for 90 days, then
daily samples; requesting fine resolution cannot restore discarded detail.

## Resources

The sampler runs every five seconds, deduplicates overlapping reads and retains
up to 120 samples / ten minutes in memory. Diagnostic operations persist their
own resource samples alongside probe results. Panel and MCP use this same owner.
Runtime sample timestamps and intervals are numeric milliseconds. API operation
creation/update timestamps retain the existing ISO contract.

CPU utilization comes from counter deltas, excluding idle, I/O wait and steal;
steal is returned separately, load average separately. Guest counters are not
double counted. RAM availability uses Linux `MemAvailable`; swap is separate.
Service CPU percentages use systemd `CPUUsageNSec` deltas and 100% per CPU core;
memory cgroup usage and main-process RSS are labeled separately. Changed PIDs and
reset counters establish a new baseline. Missing measurements are `null`, never
zero; each response states sample age and staleness. Linux is the production
metrics platform. Non-Linux development reports available OS metrics and marks
Linux-only metrics unavailable.

NIC counters are per interface. Transfer rates use the default-route interface
to avoid counting VPN forwarding twice. TCP retransmissions and UDP receive/send
buffer errors are separate kernel indicators. They are not a measured end-to-end
loss percentage, and they are host-wide rather than attributed to one user.

## Starting probes

Example MCP arguments for a server download:

```json
{"kind":"speed","vantage":"server","durationSeconds":5,"byteLimit":8388608}
```

The response contains an operation ID. Poll `diagnostic_get`, or
`operations_get(operation_id=...)`; cancellation retains collected stages. An
operation can finish successfully while its network test reports `successful=false`;
individual stages carry the evidence. Application restart marks unfinished
diagnostics failed without replaying network requests. Completed results remain
in the existing operations table, including results older than the list view.
Default operation/diagnostic reads return compact resource summaries rather than
all raw samples. `diagnostic_get(includeSamples=true)` (or the corresponding API
query) returns the persisted samples when needed. `sampleMean` is the arithmetic
mean of observed samples, not continuous CPU coverage of the whole job.

Kinds:

- `reachability`: DNS, TCP, verified TLS, HTTP, stopping at a failed layer.
- `latency`: bounded ICMP samples, min/mean/max RTT, mean absolute difference of
  consecutive RTTs as jitter, ICMP loss; unavailable ICMP returns unknown loss.
- `speed`: HTTP download, upload or both; bounded transfers include bytes,
  throughput, connection/TLS/first-byte times and completion/limit reason.
- `compare`: direct control and the selected VPN methods with the same origin,
  byte budget, duration and repeat count, serialized to avoid self-competition.
- `transport-speed`: native authenticated Hysteria download/upload, without a
  third-party origin. Only Hysteria2 methods are valid.

`family` is `ipv4` (default) or `ipv6`; `direction` is `download` (default),
`upload`, or `both`. `target` and `uploadTarget` are configurable HTTP(S) URLs.
Defaults use Cloudflare's public measurement endpoints (a small trace response for
reachability). The default download size tracks `byteLimit`. Targets resolve only
to public addresses; DNS is pinned for
the actual TCP/TLS/HTTP connection, credentials/fragments and private, loopback,
metadata or reserved destinations are rejected, and redirects are not followed.
TLS verification stays enabled. Public destination IPs are diagnostic data.

One diagnostic runs per VPS at a time. Limits: 1–30 seconds per transfer,
64 KiB–64 MiB per direction, 1–3 repeats, up to eight selected methods,
1–30 ICMP requests. Expanded method/repeat/direction budgets are validated before
launch: at most 256 MiB of transfer payload and 180 seconds of requested transfer
time. Handshakes/control messages add overhead. Server jobs have a 240-second
deadline. Child processes have deadlines/output limits and are killed on abort.

Server ICMP uses the existing privileged agent's narrow `network.ping` operation:
only a public literal IP and 1–30 packets, one probe at a time, fixed ping arguments,
64 KiB stdout and a packet-count deadline. Closing the diagnostic socket cancels
its child process. Application and agent keep `NoNewPrivileges=yes`; no changes
to host ping groups or service capabilities are required. Application resolution
and agent validation share the public-address policy. Client ICMP uses its local
platform utility; both paths share the measurement parser, including 100% loss.

## Measuring from a device or independent machine

The remote server cannot observe a user's local route by running an outbound
server test. For client-originated tests set `vantage=client`. `compare` and
`transport-speed` require this mode and an active `connectionId`. `methodIds`
optionally selects enabled installed methods; otherwise comparison selects all.

```json
{"kind":"compare","vantage":"client","connectionId":"<connection UUID>","durationSeconds":5,"byteLimit":8388608}
```

Run the returned operation on the measuring machine with the same API token in
`OUTPOST_TOKEN` and the HTTPS origin in `OUTPOST_URL`:

```sh
outpostctl diagnose --operation <operation UUID> --interface en0
# From a source checkout with Bun:
bun run diagnose --operation <operation UUID> --interface en0 \
  --mihomo /path/to/mihomo --sing-box /path/to/sing-box --hysteria /path/to/hysteria
```

Use the actual physical uplink (`en0` is only an example); the runner requires an
existing explicit interface. Native clients and curl bind their traffic to it.
`--dns-server <resolver IP>` selects a resolver if the OS DNS returns tunnel Fake-IP
addresses. DNS queries have bounded retries and cancellation. Native tools must
already be installed; the runner does not download or change system clients.
HTTP tests require curl 8.4 or newer, checked before transfer: older versions do
not enforce `--max-filesize` without Content-Length ([curl documentation](https://curl.se/docs/manpage.html#--max-filesize)).
Personal curl configuration and URL globbing are disabled. Curl timing fields are
cumulative from transfer start; through SOCKS, TCP timing includes the local proxy
connection and is not a standalone RTT measurement of the VPN server.
ICMP needs the platform ping utility (fresh Linux installs
include `iputils-ping`; older installations may need that package). Missing or
restricted ICMP is reported as unavailable. Comparison uses Mihomo for Hysteria2/XHTTP/gRPC/AnyTLS/
TrustTunnel/AmneziaWG and sing-box for Naive (Cronet build required).

The client claims an operation once via `/diagnostics/:id/claim`, requiring
`diagnostics:run` and `connections:secret`. It receives only the selected private
profiles and a short-lived report credential. Profiles reuse the subscription
outbound builders. Client config files/directories are 0600/0700 and removed in
`finally`; no TUN or system DNS is enabled. Neither profiles nor report credentials
are stored in operation results or printed. Reports are posted incrementally, so
cancellation preserves completed stages. A remote cancellation is polled once per
second; API failure, SIGINT/SIGTERM or local deadline also stop temporary clients.

Claims expire after five minutes. Client execution has a five-minute deadline;
the server waits at most ten minutes including claim/execution. The operation
labels evidence as reported by an authorized runner. Results identify each path:
`server-to-origin`, `client-to-origin`, `client-via-vpn-to-origin`, or
`client-to-vpn-server`; comparisons label the direct control separately.

Native Hysteria speedtest targets the native Hysteria server engine; Hysteria2
listeners provided by other engines use ordinary HTTP speed tests instead.
Native Hysteria speedtest works on Linux with interface binding. On macOS it
uses the same interface-bound loopback UDP relay as the existing QUIC probe and
requires Python 3 (`--python` may select it). The relay preserves datagrams but
adds a local hop; account for this when comparing implementations. Other platforms
can run supported HTTP/native-core tests; native interface-bound Hysteria speedtest
currently reports unavailable outside Linux/macOS. These are separate diagnostic
processes; the active system tunnel remains owned by the user.

Hysteria preset v3 and the bootstrap template enable authenticated `speedTest`.
Preset reconciliation preserves an explicit user `speedTest: false`. Existing
installations require the normal configuration reconciliation; applying this new
Hysteria preset can restart that engine. Agree its interruption window before
deployment. No release or production change is performed merely by adding these
sources. Fixed bandwidth hints are still omitted, preserving adaptive BBR.

The Hysteria Stats API does not export general QUIC RTT/loss counters. Responses
state that limitation with unavailable/null fields. ICMP loss, TCP retransmissions,
UDP buffer drops and QUIC loss must not be treated as equivalent measurements.
