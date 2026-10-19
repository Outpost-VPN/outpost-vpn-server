#!/usr/bin/env bash
set -euo pipefail

# Real services and filesystem paths: run only on a fresh disposable runner.
test "${GITHUB_ACTIONS:-}" = true
test "${RUNNER_ENVIRONMENT:-}" = github-hosted
test "$(id -u)" -eq 0
test "$(uname -m)" = x86_64
test ! -e /opt/outpost
test ! -e /var/lib/outpost
test ! -e /etc/outpost
archive=$(realpath "${1:?Release archive is required}")
source_root=$(cd "$(dirname "$0")/.." && pwd)
bun_binary=$(command -v bun)
version=$("$bun_binary" -p "require('$source_root/package.json').version")
baseline=0.2.0-beta.4
lab=$(mktemp -d /var/tmp/outpost-release-smoke.XXXXXX)
trap 'systemctl stop outpost outpost-agent hysteria-server xray nginx >/dev/null 2>&1 || true; rm -rf "$lab" /var/tmp/outpost-release-smoke.json' EXIT

download="https://github.com/Outpost-VPN/outpost-vpn-server/releases/download/v$baseline/outpost-$baseline-linux-amd64.tar.gz"
curl --proto '=https' --proto-redir '=https' -fsSL --retry 2 "$download" -o "$lab/baseline.tar.gz"
curl --proto '=https' --proto-redir '=https' -fsSL --retry 2 "$download.minisig" -o "$lab/baseline.tar.gz.minisig"
minisign -Vm "$lab/baseline.tar.gz" -p "$source_root/infra/release/minisign.pub"
install -d /opt/outpost/releases
tar --no-same-owner -xzf "$lab/baseline.tar.gz" -C "$lab"
(cd "$lab/outpost-$baseline" && sha256sum -c SHA256SUMS >/dev/null)
mv "$lab/outpost-$baseline" "/opt/outpost/releases/$baseline"
ln -s "releases/$baseline" /opt/outpost/current
useradd --system --home-dir /var/lib/outpost --shell /usr/sbin/nologin outpost
install -d -o outpost -g outpost -m 0700 /var/lib/outpost /var/lib/outpost/incoming
install -d -o root -g outpost -m 0750 /etc/outpost /etc/outpost/engines
install -d -m 0755 /var/www/outpost-acme /etc/letsencrypt/live/release-smoke.example
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=release-smoke.example \
  -addext 'subjectAltName=DNS:release-smoke.example,IP:203.0.113.42,IP:203.0.113.77' \
  -keyout /etc/letsencrypt/live/release-smoke.example/privkey.pem \
  -out /etc/letsencrypt/live/release-smoke.example/fullchain.pem 2>/dev/null
for ip in 203.0.113.42 203.0.113.77; do
  cp -a /etc/letsencrypt/live/release-smoke.example "/etc/letsencrypt/live/$ip"
done
cat >/etc/outpost/outpost.env <<ENV
NODE_ENV=production
OUTPOST_ENV=production
OUTPOST_VERSION=$baseline
OUTPOST_SETUP=0
OUTPOST_DOMAIN=release-smoke.example
OUTPOST_PUBLIC_IP=203.0.113.42
OUTPOST_RP_ID=release-smoke.example
OUTPOST_ORIGIN=https://release-smoke.example
OUTPOST_ADMIN_PATH=/admin
OUTPOST_XHTTP_PATH=/release-smoke-xhttp
OUTPOST_GRPC_SERVICE=release-smoke-grpc
OUTPOST_HYSTERIA_STATS_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef
OUTPOST_LISTEN=127.0.0.1:8181
OUTPOST_DATA_DIR=/var/lib/outpost
OUTPOST_CONFIG_DIR=/etc/outpost
OUTPOST_WEB_ROOT=/opt/outpost/current/public
OUTPOST_RELEASE_PUBLIC_KEY=/opt/outpost/current/infra/release/minisign.pub
OUTPOST_XRAY_BINARY=/opt/outpost/engines/xray/current/xray
OUTPOST_XRAY_API=127.0.0.1:10085
ENV
chmod 0640 /etc/outpost/outpost.env
chown root:outpost /etc/outpost/outpost.env
set -a
# shellcheck source=/dev/null
. /etc/outpost/outpost.env
set +a

# Seed through the baseline's application owners, never through a deployed DB.
mkdir "$lab/legacy-source"
git -C "$source_root" archive "v$baseline" | tar -x -C "$lab/legacy-source"
ln -s "$source_root/node_modules" "$lab/legacy-source/node_modules"
OUTPOST_DEMO=1 OUTPOST_ENV=development "$bun_binary" "$source_root/scripts/release-smoke-fixture.ts" seed "$lab/legacy-source"
/opt/outpost/current/infra/scripts/install-engines
systemctl stop nginx
sed -e 's|__DOMAIN__|release-smoke.example|g' -e 's|__PUBLIC_IP__|203.0.113.42|g' \
  -e 's|__XHTTP_PATH__|/release-smoke-xhttp|g' -e 's|__GRPC_SERVICE__|release-smoke-grpc|g' \
  /opt/outpost/current/infra/nginx/outpost.conf.template >/etc/nginx/sites-available/outpost
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/outpost /etc/nginx/sites-enabled/outpost
install -m 0644 /opt/outpost/current/infra/systemd/*.service /etc/systemd/system/
chown -R outpost:outpost /var/lib/outpost
chown -R root:outpost /etc/outpost
ufw --force enable
systemctl daemon-reload
systemctl start outpost-agent outpost hysteria-server xray nginx

ready() {
  for _ in {1..40}; do
    if curl -fsS --noproxy '*' --cacert /etc/letsencrypt/live/release-smoke.example/fullchain.pem \
      --resolve release-smoke.example:443:127.0.0.1 https://release-smoke.example/readyz >/dev/null; then return 0; fi
    sleep 1
  done
  systemctl --no-pager status outpost outpost-agent hysteria-server xray nginx || true
  return 1
}
fixture() {
  set -a
  # shellcheck source=/dev/null
  . /etc/outpost/outpost.env
  set +a
  "$bun_binary" "$source_root/scripts/release-smoke-fixture.ts" "$1" "$source_root"
}
ready
before_hysteria=$(systemctl show -p MainPID --value hysteria-server)
before_xray=$(systemctl show -p MainPID --value xray)
test "$before_hysteria" -gt 0
test "$before_xray" -gt 0

# The exact release bytes use a disposable signing key for this isolated test.
# The publish job signs and verifies the same bytes with the production key.
minisign -G -W -p "$lab/test.pub" -s "$lab/test.key" >/dev/null
cp "$lab/test.pub" /opt/outpost/current/infra/release/minisign.pub
cp "$archive" /var/lib/outpost/incoming/update.tar.gz
minisign -S -W -s "$lab/test.key" -m /var/lib/outpost/incoming/update.tar.gz
/opt/outpost/current/infra/scripts/apply-update /var/lib/outpost/incoming/update.tar.gz \
  /var/lib/outpost/incoming/update.tar.gz.minisig "$version"
ready
test "$(basename "$(readlink -f /opt/outpost/current)")" = "$version"
test "$(systemctl show -p MainPID --value hysteria-server)" = "$before_hysteria"
test "$(systemctl show -p MainPID --value xray)" = "$before_xray"
fixture verify
echo "Signed baseline update passed without restarting Hysteria/Xray"

/opt/outpost/current/infra/scripts/export-backup-plain /var/lib/outpost/backups/release-smoke.tar
cp /var/lib/outpost/backups/release-smoke.tar "$lab/backup.tar"
systemctl stop outpost hysteria-server xray nginx
rm -f /var/lib/outpost/outpost.sqlite /var/lib/outpost/outpost.sqlite-wal /var/lib/outpost/outpost.sqlite-shm /var/lib/outpost/master.key
sed -i 's/OUTPOST_PUBLIC_IP=203.0.113.42/OUTPOST_PUBLIC_IP=203.0.113.77/' /etc/outpost/outpost.env
/opt/outpost/current/infra/scripts/outpostctl migrate
head -c 32 /dev/urandom >/var/lib/outpost/master.key
chmod 0600 /var/lib/outpost/master.key
chown -R outpost:outpost /var/lib/outpost
/opt/outpost/current/infra/scripts/restore-backup "$lab/backup.tar"
ready
fixture restored
echo "Full backup restore passed and kept the destination server IP"
