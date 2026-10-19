import {clientProfiles, defaultMethods} from "../src/shared/connection-methods";
import {engineIds} from "../src/shared/engines";
import { describe, expect, test } from "bun:test";
import {
  advanced,
  applications,
  catalog,
  catalogVersion,
  detectPlatform,
  platforms,
  renderCatalogPage,
} from "../src/server/adapters/catalog";
import type { Locale } from "../src/shared/i18n";
import type { Connection } from "../src/server/models";
import {renderCompatibility} from "../src/shared/client-compatibility";

const connection: Connection = {
  id: "connection", serial: 1, name: "Мама", color: "blue", avatar: "avatar-8", status: "active", generation: 1,
  created_at: "", updated_at: "", activated_at: "", first_used_at: null, last_fetched_at: null,
  first_seen_at: null, last_seen_at: null, absence_notified_at: null, suspended_at: null, archived_at: null,
};

const baseUrl = "https://proxy.example/s/token";
const locales: Locale[] = ["ru", "en", "zh-CN", "fa"];

describe("versioned application catalog", () => {
  test("catalog v8 is complete and every application has explicit pricing", () => {
    expect(catalogVersion).toBe(8);
    expect(new Set(applications.map((app) => app.id)).size).toBe(applications.length);
    for (const app of applications) {
      expect(app.platforms.length).toBeGreaterThan(0);
      expect(clientProfiles[app.format].protocols.length).toBeGreaterThan(0);
      expect(["free", "freemium", "paid"]).toContain(app.pricing.model);
      expect(["none", "optional", "one-time", "subscription"]).toContain(app.pricing.billing);
      expect(app.pricing.sourceUrl).toStartWith("https://");
      expect(app.pricing.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["automatic", "manual"]).toContain(app.updateMode);
      expect(["exact", "limited"]).toContain(app.routeFidelity);
      for (const platform of app.platforms) expect(app.installUrls[platform]).toStartWith("https://");
    }
    expect(applications.find((app) => app.id === "stash")?.pricing).toMatchObject({ model: "paid", billing: "one-time" });
  });

  test("app support describes the actual enabled methods across server engines", () => {
    const defaults = defaultMethods();
    const grpc = defaults.find((method) => method.protocol === "grpc")!;
    const available = {installed: ["sing-box"] as const, methods: [
      {...grpc, id: "grpc-a", engine: "sing-box" as const},
      {...grpc, id: "grpc-b", engine: "sing-box" as const},
      ...defaults.map((method) => ({...method, enabled: !["hysteria2", "naive"].includes(method.protocol)})),
    ]};
    const apps = catalog(baseUrl, "android", "ru", available);
    expect(apps.length).toBeGreaterThan(0);
    for (const app of apps) expect(app.transports).toEqual(["VLESS gRPC"]);
    expect(apps.find((app) => app.id === "v2rayng")?.routing.support).toBe("full");
    expect(apps.find((app) => app.id === "happ")?.routing.support).toBe("limited");
    const html = renderCatalogPage(connection, baseUrl, "android", "ru", available);
    expect(html).toContain("VLESS gRPC");
    expect(html).not.toContain("VLESS XHTTP");
    expect(html).not.toContain("Hysteria 2");
  });

  test("manual profiles expose routing exceptions and requirements only for selected methods", () => {
    const methods = defaultMethods(engineIds);
    const all = advanced(baseUrl, "ru", {methods, installed: engineIds});
    expect(all.find((item) => item.id === "mihomo-modern")).toMatchObject({routing: {support: "full"}, requirements: "Mihomo ≥1.19.4 · Mihomo ≥1.19.21 · Mihomo ≥1.19.31"});
    expect(all.find((item) => item.id === "amneziawg-conf")).toMatchObject({routing: {support: "none"}, transports: ["AmneziaWG 3.1"]});
    expect(all.find((item) => item.id === "naive-json")?.routing.support).toBe("none");
    expect(all.find((item) => item.id === "vless-links")?.routing.support).toBe("limited");
    const onlyAnyTls = advanced(baseUrl, "ru", {methods: methods.filter((method) => method.protocol === "anytls"), installed: engineIds});
    const singBox = onlyAnyTls.find((item) => item.id === "sing-box-modern")!;
    expect(singBox.transports).toEqual(["AnyTLS"]);
    expect(singBox.requirements).toBe("sing-box ≥1.12.0");
    expect(catalog(baseUrl, "macos", "ru", {methods: [], installed: engineIds})).toEqual([]);
    expect(advanced(baseUrl, "ru", {methods: [], installed: engineIds})).toEqual([]);
    const empty = renderCatalogPage(connection, baseUrl, "macos", "ru", {methods: [], installed: engineIds});
    expect(empty).toContain('class="empty-apps"');
    expect(empty).not.toContain('class="app" data-app=');
  });

  test("AnyTLS-only subscriptions show usable apps and the required app or core versions", () => {
    const available = {methods: defaultMethods(engineIds).filter((method) => method.protocol === "anytls"), installed: engineIds};
    const apps = catalog(baseUrl, "ios", "ru", available);
    expect(apps.map((app) => app.id)).toEqual(["everywhere", "stash", "clash-mi", "sing-box-apple"]);
    expect(apps.filter((app) => app.primaryFor.includes("ios")).map((app) => app.id)).toEqual(["everywhere", "stash", "clash-mi"]);
    for (const app of apps) {
      expect(app.transports).toEqual(["AnyTLS"]);
      expect(app.routing.support).toBe("full");
      expect(app.profileUrl).toEndWith("?profile=modern");
      expect(app.qrUrl).toEndWith("?profile=modern");
    }
    expect(apps.find((app) => app.id === "everywhere")?.requirements).toBe("AnyTLS: Mihomo ≥1.19.4");
    expect(apps.find((app) => app.id === "stash")?.requirements).toBe("AnyTLS: Stash iOS ≥3.3.0 / macOS ≥4.1.0");
    expect(apps.find((app) => app.id === "sing-box-apple")?.requirements).toBe("AnyTLS: sing-box ≥1.12.0");
  });

  test("new profile links respect app-specific capabilities and keep basic subscription URLs stable", () => {
    const apps = catalog(baseUrl, undefined, "en", {methods: defaultMethods(engineIds), installed: engineIds});
    expect(apps.find((app) => app.id === "stash")?.transports).toContain("TrustTunnel");
    expect(apps.find((app) => app.id === "stash")?.transports).not.toContain("AmneziaWG 3.1");
    expect(apps.find((app) => app.id === "clash-verge")?.transports).toContain("AmneziaWG 3.1");
    expect(apps.find((app) => app.id === "sing-box-desktop")?.requirements).toContain("Naive: sing-box ≥1.13.0 · Naive: Cronet");
    const basic = catalog(baseUrl, undefined, "en", {methods: defaultMethods(["hysteria", "xray"]), installed: engineIds});
    for (const app of basic) {
      expect(app.profileUrl).toBe(`${baseUrl}/apps/${app.id}`);
      expect(app.protocolRequirements).toEqual([]);
    }
  });

  test("prioritizes full routes and the most configured protocols before platform preferences", () => {
    const expected = {
      ios: ["everywhere", "stash", "clash-mi"],
      macos: ["clash-verge", "clash-party", "flclash"],
      android: ["clash-meta", "flclash", "clash-mi"],
      windows: ["clash-verge", "clash-party", "flclash"],
      linux: ["clash-verge", "clash-party", "flclash"],
    } as const;
    for (const [platform, ids] of Object.entries(expected)) {
      const apps = catalog(baseUrl, platform, "en", {methods: defaultMethods(engineIds), installed: engineIds});
      expect(apps.filter((app) => app.primaryFor.includes(platform as never)).map((app) => app.id)).toEqual([...ids]);
      expect(apps.slice(0, 3).map((app) => app.id)).toEqual([...ids]);
    }
  });

  test("full routes outrank limited routes even with fewer compatible protocols", () => {
    const apps = catalog(baseUrl, "ios", "en", {methods: defaultMethods(["hysteria", "xray"]), installed: engineIds});
    expect(apps.map((app) => app.id)).toEqual(["everywhere", "stash", "clash-mi", "sing-box-apple", "incy", "happ"]);
    expect(apps[3]!.transports).toHaveLength(2);
    expect(apps[4]!.transports).toHaveLength(3);
  });

  test("ranking counts distinct active protocols and changes with server availability", () => {
    const methods = defaultMethods(engineIds).filter((method) => ["hysteria2", "grpc", "naive"].includes(method.protocol));
    const grpc = methods.find((method) => method.protocol === "grpc")!;
    const duplicated = [...methods, ...Array.from({length: 5}, (_, index) => ({...grpc, id: `duplicate-${index}`}))];
    const available = {methods: duplicated, installed: engineIds};
    const apps = catalog(baseUrl, "ios", "en", available);
    expect(apps.map((app) => app.id)).toEqual(["sing-box-apple", "everywhere", "stash", "clash-mi", "incy", "happ"]);
    expect(apps[0]!.transports).toHaveLength(3);
    expect(apps[1]!.transports).toHaveLength(2);
    expect(catalog(baseUrl, "ios", "en", {methods, installed: engineIds}).map((app) => app.id)).toEqual(apps.map((app) => app.id));
    for (const inactive of [
      {...available, methods: duplicated.map((method) => ({...method, enabled: method.protocol !== "naive"}))},
      {...available, installed: ["hysteria", "xray"] as const},
    ]) {
      expect(catalog(baseUrl, "ios", "en", inactive).map((app) => app.id)).toEqual(["everywhere", "stash", "clash-mi", "sing-box-apple", "incy", "happ"]);
    }
  });

  test("flat owner catalog supplies the same platform order and primary choices as the public page", () => {
    const available = {methods: defaultMethods(engineIds), installed: engineIds};
    const flat = catalog(baseUrl, undefined, "en", available);
    for (const {id} of platforms) {
      const choices = flat.filter((app) => app.platforms.includes(id)).sort((left, right) => left.orderFor[id]! - right.orderFor[id]!);
      const page = catalog(baseUrl, id, "en", available);
      expect(choices.map((app) => app.id)).toEqual(page.map((app) => app.id));
      expect(choices.map((app) => app.orderFor[id])).toEqual(choices.map((_, index) => index));
      expect(choices.filter((app) => app.primaryFor.includes(id)).map((app) => app.id)).toEqual(page.slice(0, 3).map((app) => app.id));
    }
  });

  test("exposes stable app profiles, lazy QR and only verified deep links", () => {
    const apps = catalog(baseUrl);
    expect(apps.every((app) => new URL(app.profileUrl).pathname === `/s/token/apps/${app.id}`)).toBeTrue();
    expect(apps.every((app) => new URL(app.qrUrl).pathname === `/s/token/qr/${app.id}.svg`)).toBeTrue();
    expect(apps.every((app) => new URL(app.profileUrl).search === new URL(app.qrUrl).search)).toBeTrue();
    expect(apps.every((app) => !app.profileUrl.includes("?format="))).toBeTrue();
    expect(apps.find((app) => app.id === "everywhere")?.openUrl).toBeNull();
    expect(apps.find((app) => app.id === "happ")?.openUrl).toBeNull();
    expect(apps.find((app) => app.id === "stash")?.openUrl).toStartWith("stash://");
    expect(apps.find((app) => app.id === "clash-verge")?.openUrl).toStartWith("clash://");
    expect(apps.every((app) => app.icon.startsWith("/assets/apps/"))).toBeTrue();
  });

  test("Clash Mi is available on every platform with its own import scheme and supported modern methods", () => {
    const available = {methods: defaultMethods(engineIds), installed: engineIds};
    for (const {id} of platforms) {
      const app = catalog(baseUrl, id, "en", available).find((item) => item.id === "clash-mi")!;
      expect(app.routing.support).toBe("full");
      expect(app.updateMode).toBe("automatic");
      expect(app.transports).toContain("AnyTLS");
      expect(app.transports).toContain("TrustTunnel");
      expect(app.transports).not.toContain("AmneziaWG 3.1");
      expect(app.requirements).toContain("Mihomo ≥1.19.4");
      expect(app.requirements).toContain("Mihomo ≥1.19.21");
      expect(app.installUrl).toBe(id === "ios" ? "https://apps.apple.com/us/app/clash-mi/id6744321968" : "https://github.com/KaringX/clashmi/releases/latest");
      const imported = new URL(app.openUrl!);
      expect(imported.protocol).toBe("clashmi:");
      expect(imported.hostname).toBe("install-config");
      expect(imported.searchParams.get("url")).toBe(app.profileUrl);
      expect(app.profileUrl).toEndWith("/apps/clash-mi?profile=modern");
    }
  });

  test("all application and advanced labels exist in four locales", () => {
    for (const locale of locales) {
      const apps = catalog(baseUrl, undefined, locale);
      expect(apps).toHaveLength(applications.length);
      expect(apps.every((app) => app.description.length > 0)).toBeTrue();
      const raw = advanced(baseUrl, locale);
      expect(raw).toHaveLength(8);
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
    expect(html).toContain("доступные способы подключения и поддержка маршрутов Outpost");
    expect(html).toContain("Способы подключения");
    expect(html).toContain("Маршруты Outpost — полностью");
    expect(html).toContain("Маршруты Outpost — с ограничениями");
    expect(html).toContain("Без маршрутов Outpost");
    expect(html).toContain('data-platform="macos"');
    expect(html).toContain('data-platform-panel="android"');
    expect(html).toContain('data-app="stash"');
    expect(html).toContain('data-app="clash-mi"');
    expect(html).toContain('<link rel="icon" type="image/png" href="/brand-mark.png">');
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
    expect(source).toContain("left.orderFor[platform] - right.orderFor[platform]");
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

  test("shared compatibility markup escapes profile content before insertion into the panel", async () => {
    const payload = '<img src=x onerror="alert(1)">';
    const html = renderCompatibility({
      transports: [payload],
      protocolRequirements: [{name: payload, requirement: '"><script>alert(1)</script>'}],
      routing: {support: 'limited" onclick="alert(1)', label: payload, detail: payload},
      updateMode: "manual",
    }, "ru");
    const unsafe: string[] = [];
    await new HTMLRewriter().on("*", {element(element) {
      if (["img", "script"].includes(element.tagName)) unsafe.push(element.tagName);
      for (const [name] of element.attributes) if (name.startsWith("on")) unsafe.push(name);
    }}).transform(new Response(html)).text();
    expect(unsafe).toEqual([]);
    expect(html).toContain("&lt;img");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
    expect(html).toContain("Обновляются вручную");
  });
});
