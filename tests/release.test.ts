import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

describe("release trust chain", () => {
  test("keeps the installer key identical to the committed Minisign public key", async () => {
    const publicKey = (await Bun.file(resolve(root, "infra/release/minisign.pub")).text()).trim().split("\n").at(-1)!;
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    const bootstrap = await Bun.file(resolve(root, "infra/scripts/bootstrap")).text();
    const configuration = await Bun.file(resolve(root, "src/server/config.ts")).text();
    expect(publicKey).toMatch(/^RW[QRT][A-Za-z0-9+/]{53}$/);
    expect(installer).toContain(`release_public_key="${publicKey}"`);
    expect(bootstrap).toContain(`release_public_key="${publicKey}"`);
    expect(installer).toContain("OUTPOST_RELEASE_PUBLIC_KEY=/opt/outpost/current/infra/release/minisign.pub");
    expect(configuration).toContain('join(webRoot, "..", "infra/release/minisign.pub")');
    expect(configuration).not.toContain('production ? "/opt/outpost/current/infra/release/minisign.pub"');
  });

  test("obtains the trusted IP certificate before exposing the setup application", async () => {
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    const certificate = installer.indexOf('--ip-address "$public_ip"');
    const services = installer.indexOf("systemctl enable --now nginx outpost-agent outpost");
    expect(certificate).toBeGreaterThan(0);
    expect(services).toBeGreaterThan(certificate);
    expect(installer).toContain("--preferred-profile shortlived");
  });

  test("prints the fixed IP root without creating or reading an install-time setup link", async () => {
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    const entry = await Bun.file(resolve(root, "src/server/index.ts")).text();
    expect(installer).toContain('echo "https://$public_ip/"');
    expect(installer).not.toContain("Откройте первоначальную настройку");
    expect(installer).not.toContain("setup_url=");
    expect(installer).not.toContain("journalctl -u outpost");
    expect(entry).not.toContain("ensureBootstrap");
    expect(entry).not.toContain("Одноразовая ссылка");
  });

  test("rejects a non-clean VPS before making changes when TCP 80, TCP 443, or UDP 443 is occupied", async () => {
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    const ports = installer.indexOf("ss -Hlnptu");
    const mutation = installer.indexOf("apt-get update");
    expect(ports).toBeGreaterThan(0);
    expect(ports).toBeLessThan(mutation);
    expect(installer.slice(ports, mutation)).toContain("(80|443)");
    expect(installer.slice(ports, mutation)).toContain("clean Ubuntu install is required");
    expect(installer).not.toContain("OUTPOST_EXTERNAL_PORT");
  });

  test("serves ACME challenges from an nginx-readable webroot before certificate issuance", async () => {
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    const nginxFiles = [
      "outpost-setup-http.conf.template",
      "outpost-setup.conf.template",
      "outpost.conf.template",
    ];
    expect(installer).toContain("acme_webroot=/var/www/outpost-acme");
    expect(installer).not.toContain("/var/lib/outpost/acme");
    expect(installer).toContain('chmod 0644 "$acme_webroot/.well-known/acme-challenge/outpost-probe"');
    expect(installer.indexOf("outpost-acme-ok")).toBeLessThan(installer.indexOf('"$certbot" certonly'));
    const packages = installer.indexOf("apt-get install");
    const stop = installer.indexOf("systemctl stop nginx", packages);
    const site = installer.indexOf("outpost-setup-http.conf.template", stop);
    const probe = installer.indexOf("outpost-acme-ok", site);
    const start = installer.indexOf("systemctl start nginx", probe);
    expect(packages).toBeLessThan(stop);
    expect(stop).toBeLessThan(site);
    expect(site).toBeLessThan(probe);
    expect(probe).toBeLessThan(start);
    for (const file of nginxFiles) {
      const nginx = await Bun.file(resolve(root, "infra/nginx", file)).text();
      expect(nginx).toContain("root /var/www/outpost-acme;");
      expect(nginx).not.toContain("/var/lib/outpost/acme");
    }
  });

  test("rolls back a failed first installation so the public command can be retried", async () => {
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    expect(installer).toContain("rollback_install()");
    expect(installer).toContain("systemctl stop nginx");
    expect(installer).toContain("rm -rf /opt/outpost /etc/outpost /var/lib/outpost");
    expect(installer).toContain("rollback_armed=0");
  });

  test("retries Certbot when snapd restarts during a fresh installation", async () => {
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    expect(installer).toContain("install_certbot_snap()");
    expect(installer).toContain("for attempt in 1 2 3");
    expect(installer).toContain("snap wait system seed.loaded");
  });

  test("serves setup at the IP root without legacy setup routes", async () => {
    const nginx = await Bun.file(resolve(root, "infra/nginx/outpost-setup.conf.template")).text();
    expect(nginx).toContain("location = / {");
    expect(nginx).toContain("proxy_set_header X-Outpost-Surface setup;");
    expect(nginx).toContain("location = /api/v1/setup {");
    expect(nginx).toContain("location = /api/v1/setup/domain {");
    expect(nginx).not.toContain("/api/v1/auth");
    expect(nginx).not.toContain("/admin/setup");
    expect(nginx).not.toContain("location ^~ /setup");
    expect(nginx).toContain("location / {\n        return 404;");
  });

  test("retains a restricted permanent IP edge after domain finalization", async () => {
    const nginx = await Bun.file(resolve(root, "infra/nginx/outpost.conf.template")).text();
    const ipStart = nginx.indexOf("server_name __PUBLIC_IP__ _;");
    const domainStart = nginx.indexOf("listen 443 ssl http2;", ipStart);
    const ipEdge = nginx.slice(ipStart, domainStart);
    const finalizer = await Bun.file(resolve(root, "infra/scripts/finalize-domain")).text();

    expect(ipEdge).toContain("/etc/letsencrypt/live/__PUBLIC_IP__/fullchain.pem");
    expect(ipEdge).toContain("location = / {");
    expect(ipEdge).toContain("location = /api/v1/setup {");
    expect(ipEdge).toContain("if ($request_method != GET) { return 421; }");
    expect(ipEdge).toContain("proxy_set_header X-Outpost-Surface setup;");
    expect(ipEdge).not.toContain("/api/v1/setup/domain");
    expect(ipEdge).not.toContain("/api/v1/auth");
    expect(ipEdge).not.toContain("/admin");
    expect(ipEdge).not.toContain("/s/");
    expect(ipEdge).toContain("return 421;");
    expect(nginx).toContain("proxy_set_header X-Outpost-Surface app;");
    expect(nginx).toContain("location = /api/v1/setup/domain {\n        return 404;");
    expect(finalizer).toContain('s|__PUBLIC_IP__|$public_ip|g');
    expect(finalizer).not.toContain('cert-name "$public_ip"');
  });

  test("keeps domain finalization rollback armed until the application restart is scheduled", async () => {
    const finalizer = await Bun.file(resolve(root, "infra/scripts/finalize-domain")).text();
    const schedule = finalizer.indexOf("systemd-run --on-active=2s");
    const disarm = finalizer.indexOf("armed=0", schedule);
    expect(schedule).toBeGreaterThan(0);
    expect(disarm).toBeGreaterThan(schedule);
  });

  test("restores browser uploads only after domain setup and keeps the new server identity", async () => {
    const nginx = await Bun.file(resolve(root, "infra/nginx/outpost.conf.template")).text();
    const restore = await Bun.file(resolve(root, "infra/scripts/restore-backup")).text();

    expect(nginx).toContain("location = /api/v1/setup/restore {");
    expect(nginx).toContain("client_max_body_size 256m;");
    expect(restore).toContain('test "$backup_domain" = "$current_domain"');
    expect(restore).toContain("OUTPOST_PUBLIC_IP=$current_public_ip");
    expect(restore).toContain("OUTPOST_RELEASE_PUBLIC_KEY=/opt/outpost/current/infra/release/minisign.pub");
    expect(restore).toContain("infra/nginx/outpost.conf.template");
    expect(restore).toContain("flock -n 9");
    expect(restore).toContain("Unexpected backup entry");
    expect(restore).toContain("Backup contains links or special files");
    expect(restore).toContain('[[ "$xhttp_path" =~ ^/[a-zA-Z0-9._~-]{8,128}$ ]]');
    expect(restore.match(/rm -f -- \/var\/lib\/outpost\/outpost\.sqlite-wal/g)).toHaveLength(2);
    expect(restore).toContain('install -o outpost -g outpost -m 0600 "$restore_tmp/current.sqlite"');
    expect(restore).not.toContain('install -o root -g root -m 0644 "$restore_tmp/nginx.conf"');
    expect(restore).not.toContain('cp -a "$restore_tmp/config/." /etc/outpost/');
  });

  test("reloads Nginx for every renewed certificate and restarts Hysteria only for the permanent domain", async () => {
    const hook = await Bun.file(resolve(root, "infra/renewal-hooks/deploy/outpost")).text();
    expect(hook).toContain("systemctl reload nginx");
    expect(hook).toContain('test "$setup_mode" = "0"');
    expect(hook).toContain('test "$renewed_name" = "$domain"');
    expect(hook).toContain("systemctl try-restart hysteria-server");
  });

  test("proxies every edge response to Bun over HTTP/1.1", async () => {
    for (const file of ["outpost-setup.conf.template", "outpost.conf.template"]) {
      const nginx = await Bun.file(resolve(root, "infra/nginx", file)).text();
      const tlsServer = nginx.indexOf("server {\n    listen 443");
      const securityHeaders = nginx.indexOf("\n    add_header", tlsServer);
      expect(tlsServer).toBeGreaterThan(0);
      expect(securityHeaders).toBeGreaterThan(tlsServer);
      expect(nginx.slice(tlsServer, securityHeaders)).toContain("proxy_http_version 1.1;");
    }
  });

  test("disables SSE buffering and compresses application assets", async () => {
    const nginx = await Bun.file(resolve(root, "infra/nginx/outpost.conf.template")).text();
    const setup = await Bun.file(resolve(root, "infra/nginx/outpost-setup.conf.template")).text();
    const server = await Bun.file(resolve(root, "src/server/http.ts")).text();
    const entry = await Bun.file(resolve(root, "src/server/index.ts")).text();
    const html = await Bun.file(resolve(root, "public/index.html")).text();
    const location = nginx.slice(nginx.indexOf("location = /api/v1/dashboard/events"));
    const updater = nginx.slice(nginx.indexOf("location = /api/v1/updates/prepare"));

    for (const source of [nginx, setup]) {
      expect(source).toContain("gzip on;");
      expect(source).toContain("gzip_types application/javascript text/javascript application/json text/css;");
    }
    expect(location.slice(0, location.indexOf("\n    }"))).toContain("proxy_buffering off;");
    expect(location.slice(0, location.indexOf("\n    }"))).toContain("proxy_cache off;");
    expect(location.slice(0, location.indexOf("\n    }"))).toContain("proxy_read_timeout 1h;");
    expect(updater.slice(0, updater.indexOf("\n    }"))).toContain("proxy_read_timeout 5m;");
    expect(updater.slice(0, updater.indexOf("\n    }"))).toContain("proxy_send_timeout 5m;");
    expect(server).toContain('"public, max-age=31536000, immutable"');
    expect(server).toContain('"cache-control": "no-cache"');
    expect(entry).toContain("idleTimeout: 255");
    expect(html).toContain("app.js?v=__OUTPOST_VERSION__");
    expect(html).toContain("style.css?v=__OUTPOST_VERSION__");
  });

  test("keeps subscription and both secret Xray transports out of access logs", async () => {
    const nginx = await Bun.file(resolve(root, "infra/nginx/outpost.conf.template")).text();
    for (const marker of ["location __XHTTP_PATH__", "location ^~ /__GRPC_SERVICE__/", "location ^~ /s/"]) {
      const start = nginx.indexOf(marker);
      expect(start).toBeGreaterThan(0);
      expect(nginx.slice(start, nginx.indexOf("\n    }", start))).toContain("access_log off;");
    }
    expect(nginx).not.toContain("/invite/");
    expect(nginx).not.toContain("/subscriptions/");
  });

  test("verifies detached signatures before update extraction", async () => {
    const updater = await Bun.file(resolve(root, "infra/scripts/apply-update")).text();
    const verify = updater.indexOf("minisign -Vm");
    const extract = updater.indexOf("tar --no-same-owner -xzf");
    expect(verify).toBeGreaterThan(0);
    expect(extract).toBeGreaterThan(verify);
  });

  test("normalizes release ownership during installation and updates", async () => {
    const bootstrap = await Bun.file(resolve(root, "infra/scripts/bootstrap")).text();
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    const updater = await Bun.file(resolve(root, "infra/scripts/apply-update")).text();
    const builder = await Bun.file(resolve(root, "scripts/release.ts")).text();
    const workflow = await Bun.file(resolve(root, ".github/workflows/release.yml")).text();

    for (const script of [bootstrap, installer, updater]) {
      expect(script).toContain("tar --no-same-owner -xzf");
    }
    expect(installer).toContain("chown -R -h root:root -- /opt/outpost/releases");
    expect(updater).toContain("chown -R -h root:root -- /opt/outpost/releases");
    expect(builder).toContain('["tar", "--owner=0", "--group=0", "--numeric-owner", "-czf"');
    expect(workflow).toContain("tar --numeric-owner -tvzf");
    expect(workflow).toContain('$2 != "0/0"');
  });

  test("updates and rolls back the installed application version metadata", async () => {
    const updater = await Bun.file(resolve(root, "infra/scripts/apply-update")).text();
    expect(updater).toContain('test "$version" = "$expected_version"');
    expect(updater).toContain("mark_operation completed");
    expect(updater).toContain('sed "s/^OUTPOST_VERSION=.*/OUTPOST_VERSION=$version/"');
    expect(updater).toContain('install -o root -g outpost -m 0640 "$update_tmp/outpost.env.next" "$env_file"');
    expect(updater).toContain('install -o root -g outpost -m 0640 "$env_previous" "$env_file"');
  });

  test("activates the new root-agent binary and restores it on update rollback", async () => {
    const updater = await Bun.file(resolve(root, "infra/scripts/apply-update")).text();
    expect(updater).toContain("systemctl restart outpost-agent\nsystemctl is-active --quiet outpost-agent");
    expect(updater).toContain("systemctl restart outpost-agent");
    expect(updater).toContain('if test "$hysteria_was_active" = 1; then systemctl restart hysteria-server || true; fi');
    expect(updater).toContain('if test "$xray_was_active" = 1; then systemctl restart xray || true; fi');
  });

  test("reports persistent application update stages", async () => {
    const updater = await Bun.file(resolve(root, "infra/scripts/apply-update")).text();
    for (const stage of ["verifying", "snapshotting", "installing", "restarting", "readiness"]) {
      expect(updater).toContain(`operation.update_${stage}`);
    }
    expect(updater).toContain("mark_progress 90 operation.update_readiness");
  });

  test("reconciles versioned engine presets before the updated app becomes ready", async () => {
    const updater = await Bun.file(resolve(root, "infra/scripts/apply-update")).text();
    const agent = updater.indexOf("systemctl is-active --quiet outpost-agent");
    const presets = updater.indexOf("reconcile-engine-presets");
    const app = updater.indexOf("systemctl start outpost", presets);
    expect(presets).toBeGreaterThan(agent);
    expect(app).toBeGreaterThan(presets);
    expect(updater).toContain('install -o root -g outpost -m 0640 "$hysteria_previous" /etc/outpost/engines/hysteria.yaml');
    expect(updater).toContain('install -o root -g outpost -m 0640 "$xray_previous" /etc/outpost/engines/xray.json');
    expect(updater).toContain('OUTPOST_RESTART_HYSTERIA="$hysteria_was_active" OUTPOST_RESTART_XRAY="$xray_was_active"');
  });

  test("includes the release manifest in the signed checksum set", async () => {
    const script = await Bun.file(resolve(root, "scripts/release.ts")).text();
    const manifest = script.indexOf('writeFileSync(join(stage, "manifest.json")');
    const scan = script.indexOf('new Bun.Glob("**/*")');
    expect(manifest).toBeGreaterThan(0);
    expect(scan).toBeGreaterThan(manifest);
  });

  test("releases only a tag pointing at the current main commit", async () => {
    const workflow = await Bun.file(resolve(root, ".github/workflows/release.yml")).text();
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"');
    expect(workflow).toContain('sha256sum "$archive_name" >"${archive_name}.sha256"');
  });

  test("publishes signed rule sets separately with source and license metadata", async () => {
    const workflow = await Bun.file(resolve(root, ".github/workflows/rulesets.yml")).text();
    const builder = await Bun.file(resolve(root, "scripts/rulesets.ts")).text();
    expect(workflow).toContain("gh release upload rulesets --clobber");
    expect(workflow).toContain("OUTPOST_REQUIRE_SIGNATURE=1");
    expect(builder).toContain("SagerNet/sing-geosite");
    expect(builder).toContain("SagerNet/sing-geoip");
    expect(builder).toContain("sources.json");
    expect(builder).toContain("licenses");
  });

  test("authenticates native release metadata requests in CI", async () => {
    const workflow = await Bun.file(resolve(root, ".github/workflows/ci.yml")).text();
    const installer = await Bun.file(resolve(root, "scripts/install-native-tools.ts")).text();
    expect(workflow).toContain("GITHUB_TOKEN: ${{ github.token }}");
    expect(installer).toContain("headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`");
  });

  test("builds the patched agent with its minimum supported Go toolchain", async () => {
    for (const file of ["ci.yml", "release.yml"]) {
      const workflow = await Bun.file(resolve(root, ".github/workflows", file)).text();
      expect(workflow).toContain('go-version: "1.25.x"');
    }
    expect(await Bun.file(resolve(root, "agent/go.mod")).text()).toContain("golang.org/x/crypto v0.52.0");
  });
});
