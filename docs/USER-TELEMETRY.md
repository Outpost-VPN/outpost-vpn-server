# User traffic and activity

The accounting identity is one Outpost connection record. Its devices and
connection methods contribute to one upload/download total and one online state.
No per-method usage breakdown is exposed. `TrafficService` owns counter deltas,
history, sampling and activity facts; `ConnectionService` owns combined presence.

## Collection

| Engine | Source | Interval | Activity signal |
| --- | --- | --- | --- |
| Hysteria | Authenticated `/traffic` and `/online` | 30 seconds | Connected client instances |
| Xray | Local `StatsService` user counters | 30 seconds | Positive delta within two minutes |
| Mihomo | Authenticated `/connections` | 5 seconds | Open sessions with `inboundUser` |
| sing-box | Native API `SubscribeConnections` initial snapshot | 5 seconds | Open sessions with `user` |
| AmneziaWG | Agent: fixed `awg show outpost-awg transfer` | 30 seconds | Positive delta within two minutes |

The scheduler ticks every five seconds, polls only installed engines and prevents
overlapping cycles. Independent readers run concurrently with bounded HTTP/process
timeouts. Collection errors preserve totals and set that engine's activity to
unknown. Overall presence follows online > unknown > offline, including unknown
for an installed engine without a successful observation. Removed engines cannot
keep a user online. Session-based signals require two empty observations to go
offline. Counter resets alone do not establish activity.

## Persistence and accuracy

Hysteria/Xray counters retain their historical cursor identity. Session IDs for
Mihomo/sing-box and peer public keys for AWG have independent persistent cursors.
Closing one session never resets another session's total. Polling the same
snapshot or restarting the panel does not count bytes again. Schema migration 6
preserves existing counters, samples and presence. Session cursors absent for
48 hours are discarded; historical totals keep the existing rollup policy.

Mihomo and sing-box accounting is approximate because snapshots may omit short
sessions or their final bytes. No source-IP attribution is used, so users behind
the same NAT remain distinct. Counters describe traffic observed by the runtime;
they are not a hosting-provider network billing measurement.

## Runtime contract

sing-box uses its official 1.14.3 API service, available in the normal binary;
`with_v2ray_api` and custom runtime builds are unnecessary. Protected preset 2
adds a loopback-only authenticated API on `127.0.0.1:10086`. Health checks cover
the port; connection methods cannot reserve it. Address and secret derivation
share one owner with the collector. gRPC-Web decoding uses a wire-compatible
subset of the upstream `daemon/started_service.proto`. Destination, process and
source-address fields are not retained in accounting.

AWG reads go through the existing root agent. Its policy allows only the managed
engine and fixed command, returning public keys and byte counts. It never runs
`dump` or returns private/preshared keys. Peer mapping follows the existing
credential generation owner. A new signed Outpost release supplies the agent and
preset changes; existing update/recovery procedures apply. This local feature
does not install or restart live services or change client subscriptions.

Verification: focused traffic/presence/migration/preset tests; agent policy tests;
`bun scripts/integration-telemetry.ts` checks two users across all nine supported
Mihomo/sing-box listeners using isolated loopback-only official binaries.
