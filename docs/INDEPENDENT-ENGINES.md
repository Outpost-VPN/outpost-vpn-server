# Independent engine updates

Engine upgrades no longer require a panel release. Each engine row provides a
version check and, when installation or an update is available, a download icon
next to its version. Configuration and service actions remain separate. Checks
are independent per engine and preserve sibling results.

## One release contract

`EngineReleases` owns version selection, official repositories, archive names,
expected download URLs and SHA-256 discovery. `EngineInventory` owns persisted
check state and projects the installable candidate into its existing version
contract. Successful discovery never changes the installed version. Candidate
state survives restart/backup, while initial release pins remain the fallback for
bootstrap and offline first installation. A newer installed runtime is never
advertised for downgrade when a check fails or a panel release has older pins.

Hysteria, Xray, Mihomo and sing-box use their official GitHub release assets and
GitHub's `sha256:` asset digest. Stable channels are preserved; Xray retains the
project's existing prerelease policy. No arbitrary download URL is accepted from
the browser/API. Missing artifacts or digests are shown explicitly instead of
silently allowing an unverified update.

`engine.update` still requires an immutable operation preview and exact
confirmation. The selected version/checksum must match the inventory candidate;
downgrades are rejected. The root installer invokes `outpostctl engine-release-info`
to independently resolve that version and verify its digest from the known source,
then verifies downloaded bytes. Changed upstream metadata aborts the operation.
The GitHub API is the trust source for new upstream binaries; the embedded pins
remain a trust source for initial versions. TLS and redirect protocols stay HTTPS.

Archives are staged in a new version directory. Only expected files are extracted.
The new binary validates the existing managed configuration before a running
service restarts. Listener health is checked afterward. Failed validation or
health restores the previous symlink and service; a stopped service stays stopped.
Engine update execution continues to share the connection synchronization lock.
Panel updates do not replace the runtime symlinks. Restore reconciles actual
installed versions from those symlinks.

## AmneziaWG without a panel release

The official Go/tools projects publish source tags rather than suitable runtime
release binaries. `.github/workflows/engine-release.yml` independently builds an
AWG runtime with its compatible official tools and publishes the tag
`engine-amneziawg-v<version>` in the Outpost repository. It builds no panel archive
and does not alter the panel version.

The manual workflow input is the official stable Go version without `v`.
`scripts/release-engine.ts` resolves immutable official commits, records source
archive hashes and provenance, and reuses `build-amneziawg.ts`. Sources and
licenses are included. The build job has no signing key. A separate job uses the
existing protected `release` environment and Minisign key to sign and publish
`outpost-engine-amneziawg-<version>-linux-amd64.tar.gz` and its `.minisig`.

Until that standalone build is published, the row reports that it is awaiting an
engine build, rather than requiring an Outpost update. The root installer verifies
both the published archive digest and its Minisign signature against Outpost's
trusted release key. The bundled initial AWG runtime remains installable as before.
No standalone engine release was published during local implementation.

## API and validation

- `POST /api/v1/engines/:engine/check` checks one engine (`engines:write`).
- The prior batch endpoint remains for API compatibility; the UI uses per-engine
  checks. MCP `engines_check` accepts an optional `engine` selector.
- `GET /api/v1/engines` returns installed/candidate versions, update availability,
  timestamps, release links and individual pending/error results.
- Existing `operation_preview` / `operation_confirm` installs the candidate.

Targeted tests cover candidate persistence, checksum/URL substitution, channels,
source-tag handling, exact confirmations, downgrade rejection and missing/unsigned
AWG bundles. Actual official metadata was checked for all four binary projects,
including a non-pinned Hysteria version. The dedicated Linux installer harness
uses fixture metadata/download/service callbacks and actual SHA-256/Minisign:
successful switching, preservation of stopped services, checksum rejection,
configuration/health rollback and signature rejection. It never accesses a live
Outpost service. Signed release publication and a live installed-version comparison
remain deployment work.
