import { describe, expect, test } from "bun:test";
import {
  advanced,
  applications,
  catalog,
  catalogVersion,
  detectPlatform,
  renderCatalogPage,
} from "../src/server/adapters/catalog";
import type { Locale } from "../src/shared/i18n";
import type { Connection } from "../src/server/models";

const connection: Connection = {
  id: "connection", serial: 1, name: "Мама", color: "blue", avatar: "avatar-8", status: "active", generation: 1,
  created_at: "", updated_at: "", activated_at: "", first_used_at: null, last_fetched_at: null,
  first_seen_at: null, last_seen_at: null, absence_notified_at: null, suspended_at: null, archived_at: null,
};

const baseUrl = "https://proxy.example/s/token";
const locales: Locale[] = ["ru", "en", "zh-CN", "fa"];

describe("versioned application catalog", () => {
  test("catalog v3 is complete and every application has explicit pricing", () => {
    expect(catalogVersion).toBe(3);
    expect(new Set(applications.map((app) => app.id)).size).toBe(applications.length);
    for (const app of applications) {
      expect(app.platforms.length).toBeGreaterThan(0);
      expect(app.transports.length).toBeGreaterThan(0);
      expect(["free", "freemium", "paid"]).toContain(app.pricing.model);
      expect(["none", "optional", "one-time", "subscription"]).toContain(app.pricing.billing);
      expect(app.pricing.sourceUrl).toStartWith("https://");
      expect(app.pricing.verifiedAt).toBe("2026-08-21");
      expect(["automatic", "manual"]).toContain(app.updateMode);
      expect(["exact", "limited"]).toContain(app.routeFidelity);
      for (const platform of app.platforms) expect(app.installUrls[platform]).toStartWith("https://");
    }
    expect(applications.find((app) => app.id === "stash")?.pricing).toMatchObject({ model: "paid", billing: "one-time" });
  });

  test("uses the requested three primary applications on every operating system", () => {
    const expected = {
      ios: ["everywhere", "incy", "stash"],
      macos: ["everywhere", "clash-verge", "clash-party"],
      android: ["clash-meta", "flclash", "happ"],
      windows: ["clash-verge", "clash-party", "happ"],
      linux: ["clash-verge", "clash-party", "happ"],
    } as const;
    for (const [platform, ids] of Object.entries(expected)) {
      const apps = catalog(baseUrl, platform);
      expect(apps.filter((app) => app.primaryFor.includes(platform as never)).map((app) => app.id)).toEqual([...ids]);
      expect(apps.slice(0, 3).map((app) => app.id)).toEqual([...ids]);
    }
  });

  test("exposes stable app profiles, lazy QR and only verified deep links", () => {
    const apps = catalog(baseUrl);
    expect(apps.every((app) => app.profileUrl === `${baseUrl}/apps/${app.id}`)).toBeTrue();
    expect(apps.every((app) => app.qrUrl === `${baseUrl}/qr/${app.id}.svg`)).toBeTrue();
    expect(apps.every((app) => !app.profileUrl.includes("?format="))).toBeTrue();
    expect(apps.find((app) => app.id === "everywhere")?.openUrl).toBeNull();
    expect(apps.find((app) => app.id === "happ")?.openUrl).toBeNull();
    expect(apps.find((app) => app.id === "stash")?.openUrl).toStartWith("stash://");
    expect(apps.find((app) => app.id === "clash-verge")?.openUrl).toStartWith("clash://");
    expect(apps.every((app) => app.icon.startsWith("/assets/apps/"))).toBeTrue();
  });

  test("all application and advanced labels exist in four locales", () => {
    for (const locale of locales) {
      const apps = catalog(baseUrl, undefined, locale);
      expect(apps).toHaveLength(applications.length);
      expect(apps.every((app) => app.description.length > 0)).toBeTrue();
      const raw = advanced(baseUrl, locale);
      expect(raw).toHaveLength(4);
      expect(raw.every((item) => item.name && item.description && item.profileUrl)).toBeTrue();
    }
  });

  test("detects desktop and mobile operating systems", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6)")).toBe("macos");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });

  test("browser catalog is responsive, app-oriented and does not expose the connection name", () => {
    const html = renderCatalogPage(connection, baseUrl, "ios", "ru");
    expect(html).toContain("Подключите своё устройство");
    expect(html).toContain("Способ обновления маршрутов виден сразу");
    expect(html).toContain('data-platform="macos"');
    expect(html).toContain('data-platform-panel="android"');
    expect(html).toContain('data-app="stash"');
    expect(html).not.toContain("Бесплатно");
    expect(html).not.toContain("Посмотреть в магазине");
    expect(html).not.toContain("Платно · разовая покупка");
    expect(html).toContain("Скопировать ссылку");
    expect(html).toContain("Открыть QR-код");
    expect(html).toContain(`${baseUrl}/apps/everywhere`);
    expect(html).toContain(`${baseUrl}/qr/everywhere.svg`);
    expect(html).toContain("Для опытных");
    expect(html).toContain("@media(max-width:640px)");
    expect(html).toContain('.platform-tab[aria-selected=true]{z-index:1;color:#fff;background:#0b5bea}');
    expect(html).toContain('gap:6px;overflow-x:auto');
    expect(html).not.toContain('.platform-tab[aria-selected=true]{z-index:1;margin:-1px');
    expect(html).not.toContain("?format=");
    expect(html).not.toContain("Мама");
    expect(html).not.toContain("Streisand");
  });

  test("renders Persian RTL while app names, profiles and transports stay technical", () => {
    const html = renderCatalogPage(connection, baseUrl, "android", "fa");
    expect(html).toContain('<html lang="fa" dir="rtl">');
    expect(html).toContain("دستگاه خود را متصل کنید");
    expect(html).toContain("sing-box");
    expect(html).toContain('data-app="sing-box-android"');
    expect(html).toContain(`${baseUrl}/qr/sing-box-android.svg`);
    expect(html).toContain("direction:ltr;unicode-bidi:isolate");
    expect(html).toContain("Русский");
    expect(html).toContain("简体中文");
  });

  test("admin connection dialog uses the same flat application model", async () => {
    const source = await Bun.file(new URL("../src/web/dialogs.imba", import.meta.url)).text();
    expect(source).toContain("connection.applications.filter");
    expect(source).toContain("connection.subscription.qrUrl");
    expect(source).toContain("for item in primary");
    expect(source).toContain("for item in secondary");
    expect(source).toContain("<nav.connect-tabs");
    expect(source).toContain("<div.link-options>");
    expect(source).not.toContain("<div.usage-or>");
    expect(source).toContain("t('connect.reset_confirm')");
    expect(source).toContain("t('connect.reset')");
    expect(source).not.toContain("t('Перевыпустить ссылку')");
    expect(source).toContain("<div.app-strip");
    expect(source).toContain("<button.connect-tab.expert");
    expect(source).toContain("<div.expert-screen>");
    expect(source).not.toContain("<details.expert-tab>");
    expect(source).not.toContain("<div.expert-popover>");
    expect(source).toContain("<button.profile-copy-link");
    expect(source).toContain("t('action.copy')");
    expect(source).not.toContain("<a.install-link href=install");
    expect(source).toContain("<a.app-source-link href=install");
    expect(source).toContain("<details.device-actions>");
    expect(source).toContain("<a.browser-preview href=connection.subscription.url");
    expect(source).not.toContain("<nav.connect-menu");
    expect(source).not.toContain("for item in technologies");
    expect(source).not.toContain("for item in variants");
    expect(source).not.toContain("connection.subscription.formats");
    expect(source).not.toContain("qrDataUrl");
  });
});
