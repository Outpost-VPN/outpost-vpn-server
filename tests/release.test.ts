import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

describe("release trust chain", () => {
  test("keeps the installer key identical to the committed Minisign public key", async () => {
    const publicKey = (await Bun.file(resolve(root, "infra/release/minisign.pub")).text()).trim().split("\n").at(-1)!;
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    const bootstrap = await Bun.file(resolve(root, "infra/scripts/bootstrap")).text();
    expect(publicKey).toMatch(/^RW[QRT][A-Za-z0-9+/]{53}$/);
    expect(installer).toContain(`release_public_key="${publicKey}"`);
    expect(bootstrap).toContain(`release_public_key="${publicKey}"`);
  });

  test("obtains the trusted IP certificate before exposing the setup application", async () => {
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    const certificate = installer.indexOf('--ip-address "$public_ip"');
    const services = installer.indexOf("systemctl enable --now nginx outpost-agent outpost");
    expect(certificate).toBeGreaterThan(0);
    expect(services).toBeGreaterThan(certificate);
    expect(installer).toContain("--preferred-profile shortlived");
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

  test("keeps WebAuthn unreachable on the temporary IP edge", async () => {
    const nginx = await Bun.file(resolve(root, "infra/nginx/outpost-setup.conf.template")).text();
    expect(nginx).toContain("location ^~ /api/v1/setup");
    expect(nginx).not.toContain("/api/v1/auth");
    expect(nginx).toContain("location / {\n        return 404;");
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
    const extract = updater.indexOf("tar -xzf");
    expect(verify).toBeGreaterThan(0);
    expect(extract).toBeGreaterThan(verify);
  });

  test("updates and rolls back the installed application version metadata", async () => {
    const updater = await Bun.file(resolve(root, "infra/scripts/apply-update")).text();
    expect(updater).toContain('sed "s/^OUTPOST_VERSION=.*/OUTPOST_VERSION=$version/"');
    expect(updater).toContain('install -o root -g outpost -m 0640 "$update_tmp/outpost.env.next" "$env_file"');
    expect(updater).toContain('install -o root -g outpost -m 0640 "$env_previous" "$env_file"');
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
});
