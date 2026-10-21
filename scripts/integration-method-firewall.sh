#!/usr/bin/env bash
set -euo pipefail
# Dedicated disposable Linux VM only; never run this against a real Outpost host.
test "$(id -u)" -eq 0
test -f /etc/outpost-method-lab
test -f /opt/outpost/current/.method-lab-fixture
firewall=/opt/outpost/current/infra/scripts/engine-firewall
profile=/etc/outpost/engines/mihomo.yaml
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  ip netns delete outpost-method-client 2>/dev/null || true
  ip link delete op-method-veth 2>/dev/null || true
}
trap cleanup EXIT
ufw allow 22/tcp >/dev/null
ufw allow 8443/tcp comment unrelated-service >/dev/null
ufw --force enable >/dev/null
original=$(iptables -S ufw-user-input | grep 8443)
ip netns add outpost-method-client
ip link add op-method-veth type veth peer name eth0 netns outpost-method-client
ip address add 198.18.0.1/30 dev op-method-veth
ip link set op-method-veth up
ip -n outpost-method-client address add 198.18.0.2/30 dev eth0
ip -n outpost-method-client link set eth0 up
ip -n outpost-method-client link set lo up
for port in 1443 2444; do
  python3 -m http.server "$port" --bind 0.0.0.0 >/tmp/outpost-method-origin-"$port".log 2>&1 &
  pids+=("$!")
done
sleep 0.3
request() { ip netns exec outpost-method-client curl --noproxy '*' -fsS --max-time 1 "http://198.18.0.1:$1/" >/dev/null 2>&1; }
expect_closed() { if request "$1"; then echo "Unexpected open port: $1" >&2; exit 1; fi; }
write_profile() { printf '{"listeners":[{"type":"anytls","listen":"0.0.0.0","port":%s}],"external-controller":"127.0.0.1:9097"}\n' "$1" >"$profile"; }
write_profile 1443
"$firewall" mihomo
request 1443
expect_closed 2444
write_profile 2444
"$firewall" mihomo
request 2444
expect_closed 1443
test "$original" = "$(iptables -S ufw-user-input | grep 8443)"
echo 'Configured ingress moved between real listeners; unrelated UFW rule preserved'
printf '{"listeners":[],"external-controller":"127.0.0.1:9097"}\n' >"$profile"
"$firewall" mihomo
expect_closed 2444
write_profile 2444
"$firewall" mihomo
write_profile invalid
if "$firewall" mihomo; then echo 'Malformed listener accepted' >&2; exit 1; fi
request 2444
echo 'Empty configurations closed ingress; rejected input preserved the last valid chain'
write_profile 2444
systemctl daemon-reload
systemctl start outpost-firewall
systemctl is-active --quiet outpost-firewall
"$firewall" --clear
expect_closed 2444
test "$original" = "$(iptables -S ufw-user-input | grep 8443)"
systemctl restart outpost-firewall
request 2444
echo 'Systemd regenerated owned rules; cleanup preserved unrelated ingress'
rm "$profile"
"$firewall" --all
expect_closed 2444
test "$original" = "$(iptables -S ufw-user-input | grep 8443)"
echo 'Removing an optional configuration closed stale ingress and preserved unrelated rules'
