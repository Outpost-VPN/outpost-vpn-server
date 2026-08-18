import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

describe("release trust chain", () => {
  test("keeps the installer key identical to the committed Minisign public key", async () => {
    const publicKey = (await Bun.file(resolve(root, "infra/release/minisign.pub")).text()).trim().split("\n").at(-1)!;
    const installer = await Bun.file(resolve(root, "infra/scripts/install")).text();
    expect(publicKey).toMatch(/^RW[QRT][A-Za-z0-9+/]{53}$/);
    expect(installer).toContain(`release_public_key="${publicKey}"`);
  });

  test("verifies detached signatures before update extraction", async () => {
    const updater = await Bun.file(resolve(root, "infra/scripts/apply-update")).text();
    const verify = updater.indexOf("minisign -Vm");
    const extract = updater.indexOf("tar -xzf");
    expect(verify).toBeGreaterThan(0);
    expect(extract).toBeGreaterThan(verify);
  });

  test("includes the release manifest in the signed checksum set", async () => {
    const script = await Bun.file(resolve(root, "scripts/release.ts")).text();
    const manifest = script.indexOf('writeFileSync(join(stage, "manifest.json")');
    const scan = script.indexOf('new Bun.Glob("**/*")');
    expect(manifest).toBeGreaterThan(0);
    expect(scan).toBeGreaterThan(manifest);
  });
});
