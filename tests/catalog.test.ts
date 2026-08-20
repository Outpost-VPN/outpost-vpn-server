import { describe, expect, test } from "bun:test";
import { catalog, catalogVersion, detectPlatform, renderCatalogPage } from "../src/server/adapters/catalog";
import type { Connection } from "../src/server/models";

const connection: Connection = {
  id: "connection", serial: 1, name: "Мама", color: "blue", avatar: "avatar-8", status: "active", generation: 1,
  created_at: "", updated_at: "", activated_at: "", first_used_at: null, last_fetched_at: null,
  first_seen_at: null, last_seen_at: null, absence_notified_at: null, archived_at: null,
};

describe("versioned application catalog", () => {
  test("contains the supported Mihomo, sing-box and Xray applications", () => {
    const apps = catalog("https://proxy.example/s/token");
    expect(catalogVersion).toBe(2);
    const names = apps.map((app) => app.name);
    for (const name of [
      "Everywhere Proxy", "Clash Verge Rev", "FlClash", "sing-box",
      "INCY", "v2rayN", "v2rayNG", "Happ", "Streisand",
    ]) expect(names).toContain(name);
    expect(new Set(apps.map((app) => app.technology))).toEqual(new Set(["Mihomo", "sing-box", "Xray"]));
    expect(apps.every((app) => app.subscriptionUrl.includes(`?format=${app.format}`))).toBeTrue();
    expect(apps.every((app) => app.icon.startsWith("/assets/apps/"))).toBeTrue();
  });

  test("platform filters applications and resolves the right install source", () => {
    const ios = catalog("https://proxy.example/s/token", "ios");
    const macos = catalog("https://proxy.example/s/token", "macos");
    const linux = catalog("https://proxy.example/s/token", "linux");
    expect(ios.map((app) => app.id)).toEqual(["everywhere", "incy", "happ", "streisand"]);
    expect(ios.some((app) => app.id === "flclash")).toBeFalse();
    expect(macos.some((app) => app.id === "v2rayn")).toBeTrue();
    expect(linux.some((app) => app.id === "streisand")).toBeFalse();
    expect(ios.find((app) => app.id === "incy")?.importUrl).toContain("?format=links");
    expect(ios.find((app) => app.id === "happ")?.installUrl).toContain("apps.apple.com");
    expect(linux.find((app) => app.id === "happ")?.installUrl).toContain("github.com/Happ-proxy");
  });

  test("detects desktop and mobile operating systems", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6)")).toBe("macos");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });

  test("browser catalog is responsive, platform-aware and does not expose the connection name", () => {
    const html = renderCatalogPage(connection, "https://proxy.example/s/token", "ios");
    expect(html).toContain("Настройка подключения");
    expect(html).toContain("Выберите своё устройство");
    expect(html).toContain('data-platform="macos"');
    expect(html).toContain('data-platform="ios"');
    expect(html).toContain('data-platform-panel="android"');
    expect(html).toContain("/assets/apps/everywhere.jpg");
    expect(html).toContain("Где установить");
    expect(html).toContain("@media(max-width:640px)");
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain("Мама");
    expect(html).not.toContain("FoXray");
    expect(html).not.toContain("v2RayTun");
  });

  test("admin creation flow has no application selector or invitation step", async () => {
    const source = await Bun.file(new URL("../src/web/dialogs.imba", import.meta.url)).text();
    expect(source).not.toContain("client-grid");
    expect(source).not.toContain("store.invitation");
    expect(source).not.toContain("приглаш");
    expect(source).toContain('"/api/v1/connections/{current.id}/retry"');
    expect(source).toContain("connection.subscription.qrDataUrl");
    expect(source).toContain("for item in technologies");
    expect(source).toContain("Конкретный формат");
    expect(source).toContain("for item in variants");
    expect(source).not.toContain("Какое это устройство?");
    expect(source).not.toContain("Добавить в приложение");
    expect(source).not.toContain("/api/v1/accesses");
    expect(source).toContain("@media(max-width: 560px)");
  });
});
