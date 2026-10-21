#!/usr/bin/env bash
set -euo pipefail

# This test stops root's user manager: only an explicitly marked disposable VM.
test "${OUTPOST_RELEASE_LAB:-}" = 1
test -f /etc/outpost-release-lab
test "$(id -u)" = 0
certbot=$(realpath "${1:?Path to infra/scripts/run-certbot is required}")
lab=$(mktemp -d)
trap 'rm -rf "$lab"' EXIT
systemctl start user@0
# The child shell records its own exit status after root's user manager stops.
# shellcheck disable=SC2016
systemd-run --system --unit="outpost-certbot-test-$(cat /proc/sys/kernel/random/uuid)" --collect --quiet \
  /bin/sh -c 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus "$1" --version >"$2/result" 2>&1; echo $? >"$2/status"' sh "$certbot" "$lab"
scope=
for _ in {1..100}; do
  scope=$(systemctl list-units --type=scope --state=running --no-legend 'snap.certbot.certbot-*' | awk '{print $1; exit}')
  test -z "$scope" || break
  sleep 0.05
done
test -n "$scope"
group=$(systemctl show -p ControlGroup --value "$scope")
[[ "$group" = /system.slice/snap.certbot.certbot-*.scope ]]
test ! -e "$lab/status"
systemctl stop user@0
for _ in {1..100}; do
  test ! -e "$lab/status" || break
  sleep 0.1
done
cat "$lab/result"
test "$(cat "$lab/status")" = 0
echo 'Certbot completed in its system scope after root session manager stopped'
