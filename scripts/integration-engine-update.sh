#!/usr/bin/env bash
set -euo pipefail
# Installer contract test with fixture metadata/downloads/service callbacks.
# Run only in our disposable VM; never on a deployed Outpost host.
test "$(id -u)" -eq 0
test -f /etc/outpost-engine-lab
test -f /opt/outpost/current/.engine-lab-fixture
lab=/var/tmp/outpost-engine-lab
mkdir -p "$lab/bin" /opt/outpost/current/bin /opt/outpost/current/infra/scripts /opt/outpost/current/infra/release /etc/outpost/engines
export PATH="$lab/bin:$PATH"
cat >"$lab/bin/systemctl" <<'SCRIPT'
#!/usr/bin/env bash
case "$1" in
 is-active) test -f /var/tmp/outpost-engine-lab/active ;;
 restart) echo "$2" >>/var/tmp/outpost-engine-lab/restarts; touch /var/tmp/outpost-engine-lab/active ;;
 enable|disable) : ;;
 *) exit 1 ;;
esac
SCRIPT
cat >"$lab/bin/curl" <<'SCRIPT'
#!/usr/bin/env bash
while test "$#" -gt 0; do
 if test "$1" = -o; then output=$2; shift 2; else url=$1; shift; fi
done
name=${url##*/}
cp "/var/tmp/outpost-engine-lab/$name" "$output"
SCRIPT
cat >/opt/outpost/current/bin/outpostctl <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
engine=$2
if test "$1" = engine-info; then
 if test "$engine" = hysteria; then printf 'hysteria-server\nhysteria.yaml\nbinary\nhysteria\n1.0.0\nold\nhttps://example.test/default\n443/udp\n443/udp\n';
 else printf 'outpost-amneziawg\namneziawg.json\nbundled\namneziawg-go\n1.0.0\nold\n-\n51820/udp\n51820/udp\n'; fi
elif test "$1" = engine-release-info; then
 version=$3
 checksum=$(cat "/var/tmp/outpost-engine-lab/$engine-$version.sha")
 test "$4" = "$checksum"
 if test "$engine" = hysteria; then printf '%s\nhttps://example.test/hysteria-%s\nbinary\n-\n' "$checksum" "$version";
 else printf '%s\nhttps://example.test/amneziawg-%s.tar.gz\ntar.gz\nhttps://example.test/amneziawg-%s.tar.gz.minisig\n' "$checksum" "$version" "$version"; fi
else exit 1; fi
SCRIPT
cat >/opt/outpost/current/infra/scripts/apply-config <<'SCRIPT'
#!/usr/bin/env bash
binary=hysteria
if test "$3" = amneziawg; then binary=amneziawg-go; fi
! grep -q REJECT "/opt/outpost/engines/$3/current/$binary"
SCRIPT
cat >/opt/outpost/current/infra/scripts/engine-health <<'SCRIPT'
#!/usr/bin/env bash
test ! -f /var/tmp/outpost-engine-lab/fail-health
SCRIPT
cat >/opt/outpost/current/infra/scripts/engine-firewall <<'SCRIPT'
#!/usr/bin/env bash
exit 0
SCRIPT
chmod +x "$lab/bin/"* /opt/outpost/current/bin/outpostctl /opt/outpost/current/infra/scripts/{apply-config,engine-health,engine-firewall}
installer=/opt/outpost/current/infra/scripts/update-engine
mkdir -p /opt/outpost/engines/hysteria/1.0.0
printf '#!/usr/bin/env bash\nexit 0\n' >/opt/outpost/engines/hysteria/1.0.0/hysteria
chmod +x /opt/outpost/engines/hysteria/1.0.0/hysteria
ln -s 1.0.0 /opt/outpost/engines/hysteria/current
printf '{}' >/etc/outpost/engines/hysteria.yaml
touch "$lab/active" "$lab/restarts"
for version in 1.0.1 1.0.2 1.0.3 1.0.4 1.0.5; do
 printf '#!/usr/bin/env bash\n# %s\nexit 0\n' "$version" >"$lab/hysteria-$version"
 if test "$version" = 1.0.4; then echo REJECT >>"$lab/hysteria-$version"; fi
 sha256sum "$lab/hysteria-$version" | cut -d' ' -f1 >"$lab/hysteria-$version.sha"
done
update() { "$installer" hysteria "$1" "$(cat "$lab/hysteria-$1.sha")"; }
current() { basename "$(readlink -f /opt/outpost/engines/hysteria/current)"; }
update 1.0.1
test "$(current)" = 1.0.1
test -x /opt/outpost/engines/hysteria/current/hysteria
test -d /opt/outpost/engines/hysteria/1.0.0
test "$(wc -l <"$lab/restarts")" -eq 1
rm "$lab/active"
update 1.0.2
test "$(current)" = 1.0.2
test ! -e "$lab/active"
test "$(wc -l <"$lab/restarts")" -eq 1
echo 'Verified update switched versions; stopped services stayed stopped'
echo tampered >>"$lab/hysteria-1.0.3"
if update 1.0.3; then echo 'Checksum corruption accepted' >&2; exit 1; fi
test "$(current)" = 1.0.2
test ! -d /opt/outpost/engines/hysteria/1.0.3
if update 1.0.4; then echo 'Rejected configuration accepted' >&2; exit 1; fi
test "$(current)" = 1.0.2
test ! -e "$lab/active"
touch "$lab/active" "$lab/fail-health"
if update 1.0.5; then echo 'Failed health check accepted' >&2; exit 1; fi
test "$(current)" = 1.0.2
test ! -d /opt/outpost/engines/hysteria/1.0.5
test "$(wc -l <"$lab/restarts")" -eq 3
rm "$lab/fail-health" "$lab/active"
echo 'Checksum, config and health failures preserved/restored the prior version'
# A separate AWG archive must also pass an actual Minisign verification.
mkdir "$lab/awg-stage"
for binary in amneziawg-go awg; do
 printf '#!/usr/bin/env bash\nexit 0\n' >"$lab/awg-stage/$binary"
done
(cd "$lab/awg-stage" && sha256sum amneziawg-go awg >SHA256SUMS)
for name in SOURCE_SHA256 sources.json amneziawg-go.LICENSE amneziawg-tools.LICENSE; do echo fixture >"$lab/awg-stage/$name"; done
tar -czf "$lab/amneziawg-2.0.0.tar.gz" -C "$lab/awg-stage" .
minisign -G -W -p /opt/outpost/current/infra/release/minisign.pub -s "$lab/key" >/dev/null
minisign -S -W -s "$lab/key" -m "$lab/amneziawg-2.0.0.tar.gz"
sha256sum "$lab/amneziawg-2.0.0.tar.gz" | cut -d' ' -f1 >"$lab/amneziawg-2.0.0.sha"
printf '{}' >/etc/outpost/engines/amneziawg.json
"$installer" amneziawg 2.0.0 "$(cat "$lab/amneziawg-2.0.0.sha")"
test -x /opt/outpost/engines/amneziawg/current/awg
test -x /opt/outpost/engines/amneziawg/current/amneziawg-go
cp "$lab/amneziawg-2.0.0.tar.gz" "$lab/amneziawg-2.0.1.tar.gz"
cp "$lab/amneziawg-2.0.0.sha" "$lab/amneziawg-2.0.1.sha"
echo invalid-signature >"$lab/amneziawg-2.0.1.tar.gz.minisig"
if "$installer" amneziawg 2.0.1 "$(cat "$lab/amneziawg-2.0.1.sha")"; then echo 'Invalid bundle signature accepted' >&2; exit 1; fi
test "$(basename "$(readlink -f /opt/outpost/engines/amneziawg/current)")" = 2.0.0
echo 'Standalone AWG bundle verified; invalid signature rejected before switching'
