import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AuthService } from "../src/server/auth/webauthn";
import { hashToken } from "../src/server/security";
import { SetupService } from "../src/server/services/setup";
import { database } from "./helpers";

describe("initial domain setup", () => {
  let fixture: ReturnType<typeof database>;
  let auth: AuthService;

  beforeEach(() => {
    fixture = database();
    auth = new AuthService(fixture.db);
  });

  afterEach(() => fixture.close());

  test("exposes the installed address without a bootstrap token", () => {
    const setup = new SetupService(auth, { setup: true, publicIp: "203.0.113.42", adminPath: "/admin" });
    expect(setup.state()).toEqual({ status: "available", publicIp: "203.0.113.42" });
  });

  test("returns only the configured status after switching to the permanent domain", () => {
    const setup = new SetupService(auth, { setup: false, publicIp: "203.0.113.42", adminPath: "/admin" });
    expect(setup.state()).toEqual({ status: "configured" });
    expect(() => setup.finalize({ domain: "proxy.example.com" })).toThrow("уже завершена");
  });

  test("finalizes a verified domain and creates a hash-only claim handoff", async () => {
    const requests: unknown[] = [];
    const setup = new SetupService(
      auth,
      { setup: true, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => ["203.0.113.42"],
      async (request) => { requests.push(request); return { ok: true }; },
    );
    const result = await setup.finalize({ domain: "Proxy.Example.com", language: "fa" });
    const onboarding = new URL(result.onboardingUrl);
    const claim = onboarding.searchParams.get("claim")!;
    const stored = fixture.db.setting<{ hash: string; expiresAt: string } | null>("setup_claim", null);

    expect(requests).toEqual([{ action: "setup.finalize", payload: { domain: "proxy.example.com", publicIp: "203.0.113.42" } }]);
    expect(onboarding.origin).toBe("https://proxy.example.com");
    expect(onboarding.pathname).toBe("/admin/onboarding");
    expect(onboarding.searchParams.get("lang")).toBe("fa");
    expect(claim).toBeTruthy();
    expect(stored?.hash).toBe(hashToken(claim));
    expect(stored?.expiresAt).toBeString();
    expect(new Date(stored!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(stored!.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);
    expect(JSON.stringify(stored)).not.toContain(claim);
  });

  test("does not invoke root-agent or issue a claim before DNS points to the server", async () => {
    let invoked = false;
    const setup = new SetupService(
      auth,
      { setup: true, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => ["198.51.100.10"],
      async () => { invoked = true; return { ok: true }; },
    );
    await expect(setup.finalize({ domain: "proxy.example.com" })).rejects.toThrow("не указывает");
    expect(invoked).toBeFalse();
    expect(fixture.db.setting("setup_claim", null)).toBeNull();
  });

  test("rejects a parallel finalization with 409", async () => {
    let release!: () => void;
    let entered!: () => void;
    const running = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const setup = new SetupService(
      auth,
      { setup: true, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => ["203.0.113.42"],
      async () => { entered(); await running; return { ok: true }; },
    );

    const first = setup.finalize({ domain: "proxy.example.com" });
    await started;
    const parallel = setup.finalize({ domain: "other.example.com" });
    await expect(parallel).rejects.toMatchObject({ status: 409 });
    await expect(parallel).rejects.toThrow("уже выполняется");
    release();
    await first;
  });

  test("returns an actionable setup error when root-agent fails", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    const setup = new SetupService(
      auth,
      { setup: true, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => ["203.0.113.42"],
      async () => { throw new Error("socket closed"); },
    );
    const result = setup.finalize({ domain: "proxy.example.com" });
    await expect(result).rejects.toMatchObject({ status: 502 });
    await expect(result).rejects.toThrow("DNS-запись подтверждена");
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  test("does not accept an IP address or numeric suffix as a permanent domain", async () => {
    const setup = new SetupService(
      auth,
      { setup: true, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => ["203.0.113.42"],
      async () => ({ ok: true }),
    );
    await expect(setup.finalize({ domain: "203.0.113.42" })).rejects.toThrow("Укажите корректный домен");
    await expect(setup.finalize({ domain: "example.123" })).rejects.toThrow("Укажите корректный домен");
  });

  test("does not accept an unknown onboarding language", async () => {
    const setup = new SetupService(
      auth,
      { setup: true, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => ["203.0.113.42"],
      async () => ({ ok: true }),
    );
    await expect(setup.finalize({ domain: "proxy.example.com", language: "de" })).rejects.toThrow();
  });

  test("allows a valid first-claim to schedule one browser restore", async () => {
    const requests: unknown[] = [];
    const claim = auth.issueClaim();
    const setup = new SetupService(
      auth,
      { setup: false, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => [],
      async (request) => { requests.push(request); return { ok: true }; },
    );
    const restoreId = "12345678-1234-4234-8234-123456789abc";
    await expect(setup.restore({
      claimToken: claim.token,
      archive: `/var/lib/outpost/incoming/restore-${restoreId}.age`,
      restoreId,
      passphrase: "correct horse battery staple",
    })).resolves.toEqual({ status: "restarting" });
    expect(requests).toEqual([{
      action: "backup.restore",
      payload: {
        archive: `/var/lib/outpost/incoming/restore-${restoreId}.age`,
        restoreId,
        passphrase: "correct horse battery staple",
      },
    }]);
    expect(fixture.db.setting<{ hash: string } | null>("setup_claim", null)?.hash).toBe(hashToken(claim.token));
  });

  test("rejects a parallel browser restore before it reaches root-agent", async () => {
    let release!: () => void;
    let entered!: () => void;
    const running = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const claim = auth.issueClaim();
    const setup = new SetupService(
      auth,
      { setup: false, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => [],
      async () => { entered(); await running; return { ok: true }; },
    );
    const input = {
      claimToken: claim.token,
      archive: "/var/lib/outpost/incoming/restore-12345678-1234-4234-8234-123456789abc.tar",
      restoreId: "12345678-1234-4234-8234-123456789abc",
    };

    const first = setup.restore(input);
    await started;
    const parallel = setup.restore(input);
    await expect(parallel).rejects.toMatchObject({ status: 409 });
    await expect(parallel).rejects.toThrow("уже выполняется");
    release();
    await first;
  });

  test("keeps the first-claim usable when root-agent rejects a backup", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    const claim = auth.issueClaim();
    const setup = new SetupService(
      auth,
      { setup: false, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => [],
      async () => { throw new Error("invalid archive"); },
    );

    await expect(setup.restore({
      claimToken: claim.token,
      archive: "/var/lib/outpost/incoming/restore-12345678-1234-4234-8234-123456789abc.tar",
      restoreId: "12345678-1234-4234-8234-123456789abc",
    })).rejects.toMatchObject({ status: 400 });
    expect(fixture.db.setting<{ hash: string } | null>("setup_claim", null)?.hash).toBe(hashToken(claim.token));
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  test("rejects browser restore without the current first-claim", async () => {
    const setup = new SetupService(
      auth,
      { setup: false, publicIp: "203.0.113.42", adminPath: "/admin" },
      async () => [],
      async () => ({ ok: true }),
    );
    await expect(setup.restore({
      claimToken: "invalid",
      archive: "/var/lib/outpost/incoming/restore-12345678-1234-4234-8234-123456789abc.tar",
      restoreId: "12345678-1234-4234-8234-123456789abc",
    })).rejects.toThrow("недействительно или истекло");
  });
});
