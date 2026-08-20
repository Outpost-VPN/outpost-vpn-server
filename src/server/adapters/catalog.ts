import type { Connection, SubscriptionFormat } from "../models";

export type AppSupport = "tested" | "compatible";
export type AppPlatform = "macos" | "ios" | "android" | "windows" | "linux";

export type AppDefinition = {
  id: string;
  name: string;
  description: string;
  technology: "Mihomo" | "sing-box" | "Xray";
  format: SubscriptionFormat;
  platforms: AppPlatform[];
  support: AppSupport;
  recommended?: AppPlatform[];
  icon: string;
  installUrls: Partial<Record<AppPlatform, string>>;
  deepLink?: (url: string) => string;
};

export const catalogVersion = 2;
export const platforms: { id: AppPlatform; label: string }[] = [
  { id: "macos", label: "macOS" },
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
  { id: "windows", label: "Windows" },
  { id: "linux", label: "Linux" },
];

const platformOrder: Record<AppPlatform, string[]> = {
  macos: ["everywhere", "incy", "happ", "clash-verge", "flclash", "v2rayn", "sing-box-apple"],
  ios: ["everywhere", "incy", "happ", "streisand"],
  android: ["sing-box-android", "v2rayng", "happ", "flclash"],
  windows: ["clash-verge", "v2rayn", "happ", "flclash", "sing-box-desktop"],
  linux: ["clash-verge", "v2rayn", "happ", "flclash", "sing-box-desktop"],
};

const appleEverywhere = "https://apps.apple.com/us/app/everywhere-proxy/id6766003090";
const appleIncy = "https://apps.apple.com/us/app/incy/id6756943388";
const appleHapp = "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215";

export const applications: AppDefinition[] = [
  {
    id: "everywhere",
    name: "Everywhere Proxy",
    description: "Простое подключение в один клик.",
    technology: "Mihomo",
    format: "mihomo",
    platforms: ["macos", "ios"],
    support: "tested",
    recommended: ["macos", "ios"],
    icon: "/assets/apps/everywhere.jpg",
    installUrls: { macos: appleEverywhere, ios: appleEverywhere },
    deepLink: mihomoLink,
  },
  {
    id: "incy",
    name: "INCY",
    description: "Удобный клиент с понятным интерфейсом.",
    technology: "Xray",
    format: "links",
    platforms: ["macos", "ios"],
    support: "tested",
    icon: "/assets/apps/incy.jpg",
    installUrls: { macos: appleIncy, ios: appleIncy },
    deepLink: incyLink,
  },
  {
    id: "happ",
    name: "Happ",
    description: "Кроссплатформенный клиент на базе Xray.",
    technology: "Xray",
    format: "xray",
    platforms: ["macos", "ios", "android", "windows", "linux"],
    support: "compatible",
    icon: "/assets/apps/happ.jpg",
    installUrls: {
      macos: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/Happ.macOS.universal.dmg",
      ios: appleHapp,
      android: "https://play.google.com/store/apps/details?id=com.happproxy",
      windows: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe",
      linux: "https://github.com/Happ-proxy/happ-desktop/releases/latest",
    },
  },
  {
    id: "streisand",
    name: "Streisand",
    description: "Клиент для iPhone и iPad.",
    technology: "Xray",
    format: "xray",
    platforms: ["ios"],
    support: "compatible",
    icon: "/assets/apps/streisand.jpg",
    installUrls: { ios: "https://apps.apple.com/us/app/streisand/id6450534064" },
  },
  {
    id: "clash-verge",
    name: "Clash Verge Rev",
    description: "Функциональный клиент на базе Mihomo.",
    technology: "Mihomo",
    format: "mihomo",
    platforms: ["macos", "windows", "linux"],
    support: "tested",
    recommended: ["windows", "linux"],
    icon: "/assets/apps/clash-verge-rev.png",
    installUrls: {
      macos: "https://github.com/clash-verge-rev/clash-verge-rev/releases/latest",
      windows: "https://github.com/clash-verge-rev/clash-verge-rev/releases/latest",
      linux: "https://github.com/clash-verge-rev/clash-verge-rev/releases/latest",
    },
    deepLink: clashLink,
  },
  {
    id: "flclash",
    name: "FlClash",
    description: "Лёгкий кроссплатформенный клиент.",
    technology: "Mihomo",
    format: "mihomo",
    platforms: ["macos", "android", "windows", "linux"],
    support: "compatible",
    icon: "/assets/apps/flclash.png",
    installUrls: {
      macos: "https://github.com/chen08209/FlClash/releases/latest",
      android: "https://github.com/chen08209/FlClash/releases/latest",
      windows: "https://github.com/chen08209/FlClash/releases/latest",
      linux: "https://github.com/chen08209/FlClash/releases/latest",
    },
    deepLink: clashLink,
  },
  {
    id: "sing-box-android",
    name: "sing-box",
    description: "Официальный клиент sing-box для Android.",
    technology: "sing-box",
    format: "sing-box",
    platforms: ["android"],
    support: "tested",
    recommended: ["android"],
    icon: "/assets/apps/sing-box.svg",
    installUrls: { android: "https://sing-box.sagernet.org/clients/android/" },
  },
  {
    id: "sing-box-apple",
    name: "sing-box",
    description: "Официальный клиент sing-box для macOS.",
    technology: "sing-box",
    format: "sing-box",
    platforms: ["macos"],
    support: "compatible",
    icon: "/assets/apps/sing-box.svg",
    installUrls: { macos: "https://sing-box.sagernet.org/clients/apple/" },
  },
  {
    id: "sing-box-desktop",
    name: "sing-box",
    description: "Официальный настольный клиент sing-box.",
    technology: "sing-box",
    format: "sing-box",
    platforms: ["windows", "linux"],
    support: "compatible",
    icon: "/assets/apps/sing-box.svg",
    installUrls: {
      windows: "https://sing-box.sagernet.org/clients/desktop/",
      linux: "https://sing-box.sagernet.org/clients/desktop/",
    },
  },
  {
    id: "v2rayn",
    name: "v2rayN",
    description: "Настраиваемый клиент на базе Xray.",
    technology: "Xray",
    format: "xray",
    platforms: ["macos", "windows", "linux"],
    support: "tested",
    icon: "/assets/apps/v2rayn.png",
    installUrls: {
      macos: "https://github.com/2dust/v2rayN/releases/latest",
      windows: "https://github.com/2dust/v2rayN/releases/latest",
      linux: "https://github.com/2dust/v2rayN/releases/latest",
    },
  },
  {
    id: "v2rayng",
    name: "v2rayNG",
    description: "Надёжный Android-клиент на базе Xray.",
    technology: "Xray",
    format: "xray",
    platforms: ["android"],
    support: "tested",
    icon: "/assets/apps/v2rayng.png",
    installUrls: { android: "https://github.com/2dust/v2rayNG/releases/latest" },
  },
];

export function catalog(baseUrl: string, platform?: string) {
  const selected = isPlatform(platform) ? platform : null;
  return applications
    .filter((app) => !selected || app.platforms.includes(selected))
    .sort((left, right) => rank(left, selected) - rank(right, selected) || left.name.localeCompare(right.name))
    .map((app) => {
      const subscriptionUrl = `${baseUrl}?format=${app.format}`;
      return {
        ...app,
        subscriptionUrl,
        installUrl: selected ? app.installUrls[selected] ?? null : null,
        importUrl: app.deepLink?.(subscriptionUrl) ?? null,
        deepLink: undefined,
      };
    });
}

export function detectPlatform(userAgent: string) {
  const value = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(value)) return "ios";
  if (/android/.test(value)) return "android";
  if (/macintosh|mac os/.test(value)) return "macos";
  if (/windows/.test(value)) return "windows";
  if (/linux|x11/.test(value)) return "linux";
  return "unknown";
}

export function renderCatalogPage(_connection: Connection, baseUrl: string, platform: string) {
  const initial = isPlatform(platform) ? platform : "macos";
  const tabs = platforms.map(({ id, label }) => `
    <button class="platform-tab" type="button" role="tab" aria-selected="${id === initial}" data-platform="${id}">
      <span>${label}</span><span class="auto-badge" data-auto-badge hidden>Авто</span>
    </button>`).join("");
  const panels = platforms.map(({ id, label }) => `
    <section class="platform-panel" role="tabpanel" data-platform-panel="${id}"${id === initial ? "" : " hidden"}>
      <h2 class="visually-hidden">Приложения для ${label}</h2>
      <div class="apps">${catalog(baseUrl, id).map((app) => card(app, id)).join("")}</div>
    </section>`).join("");

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Настройка подключения · Outpost</title>
<link rel="stylesheet" href="/vendor/phosphor/style.css">
<style>
:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101a3b;background:#fff;font-synthesis:none}*{box-sizing:border-box}body{margin:0;background:#fff;color:#101a3b}.site-header{height:64px;border-bottom:1px solid #e2e8f2}.site-header__inner,.page{width:min(1180px,calc(100% - 40px));margin:0 auto}.site-header__inner{height:100%;display:flex;align-items:center}.brand{display:inline-flex;align-items:center;gap:11px;color:#101a3b;font-size:21px;font-weight:760;letter-spacing:-.02em;text-decoration:none}.brand img{width:32px;height:32px;display:block}.page{padding:48px 0 72px}.intro{margin-bottom:30px}.intro h1{margin:0;font-size:clamp(34px,4vw,48px);line-height:1.08;letter-spacing:-.045em}.intro p{margin:12px 0 0;color:#65718e;font-size:17px;line-height:1.55}.platform-tabs{display:grid;grid-template-columns:repeat(5,1fr);overflow:hidden;margin-bottom:32px;border:1px solid #d8e0ed;border-radius:13px;background:#f8faff}.platform-tab{min-height:58px;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 18px;border:0;border-right:1px solid #d8e0ed;background:transparent;color:#101a3b;font:inherit;font-size:15px;font-weight:650;cursor:pointer;transition:background-color .16s,color .16s,box-shadow .16s}.platform-tab:last-child{border-right:0}.platform-tab:hover{background:#eff4fd}.platform-tab:focus-visible{outline:3px solid #9cc1ff;outline-offset:-3px}.platform-tab[aria-selected="true"]{position:relative;z-index:1;margin:-1px;color:#fff;background:#0b5bea;border:1px solid #0b5bea;border-radius:12px;box-shadow:0 6px 16px rgba(11,91,234,.18)}.auto-badge{padding:4px 7px;border-radius:6px;background:rgba(255,255,255,.16);font-size:12px;font-weight:650}.apps{overflow:hidden;border:1px solid #d8e0ed;border-radius:14px;background:#fff}.app{display:grid;grid-template-columns:72px minmax(220px,1fr) 150px 270px;align-items:center;gap:24px;padding:25px 28px;border-bottom:1px solid #dfe6f0}.app:last-child{border-bottom:0}.app-icon{width:72px;height:72px;display:block;object-fit:cover;border-radius:17px;background:#fff;box-shadow:0 5px 16px rgba(24,39,75,.11)}.app-copy{min-width:0}.recommendation{display:inline-flex;margin-bottom:7px;padding:4px 7px;border-radius:5px;background:#e8f0ff;color:#075bea;font-size:12px;font-weight:720}.app h3{margin:0;font-size:20px;line-height:1.25;letter-spacing:-.025em}.app-description{margin:6px 0 0;color:#66728e;font-size:14px;line-height:1.45}.app-status{display:flex;align-items:center;gap:7px;color:#67738e;font-size:14px;font-weight:650;white-space:nowrap}.app-status i{font-size:19px}.app-status--tested{color:#16824b}.actions{display:grid;gap:7px}.action-buttons{display:grid;grid-template-columns:1fr 1.2fr;gap:10px}.button{min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 14px;border:1px solid #0b5bea;border-radius:9px;background:#0b5bea;color:#fff;font:inherit;font-size:14px;font-weight:720;text-align:center;text-decoration:none;cursor:pointer;transition:background-color .16s,border-color .16s,transform .16s}.button:hover{background:#084fcf;border-color:#084fcf}.button:active{transform:translateY(1px)}.button:focus-visible{outline:3px solid #9cc1ff;outline-offset:2px}.button--secondary{background:#fff;color:#075bea}.button--secondary:hover{background:#f2f6ff;color:#075bea;border-color:#075bea}.button i{font-size:16px}.feedback{min-height:18px;color:#16824b;font-size:12px;line-height:1.45}.help{display:flex;align-items:center;gap:15px;margin-top:24px;padding:18px 22px;border:1px solid #bfd4fb;border-radius:13px;background:#f8fbff}.help>i{flex:0 0 auto;color:#075bea;font-size:27px}.help-copy{min-width:0}.help strong{display:block;font-size:16px}.help p{margin:3px 0 0;color:#65718e;font-size:13px;line-height:1.45}.help-link{display:inline-flex;align-items:center;gap:6px;margin-left:auto;color:#075bea;font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap}.help-link:hover{text-decoration:underline}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}[hidden]{display:none!important}
@media(max-width:900px){.app{grid-template-columns:64px minmax(0,1fr) 135px;gap:18px;padding:22px}.app-icon{width:64px;height:64px;border-radius:15px}.actions{grid-column:2/-1}.action-buttons{grid-template-columns:150px minmax(170px,1fr)}}
@media(max-width:640px){.site-header{height:58px}.site-header__inner,.page{width:min(100% - 28px,560px)}.brand{font-size:19px}.brand img{width:30px;height:30px}.page{padding:30px 0 44px}.intro{margin-bottom:24px}.intro h1{font-size:31px;line-height:1.13}.intro p{margin-top:10px;font-size:15px;line-height:1.5}.platform-tabs{display:flex;overflow-x:auto;margin:0 -14px 24px;padding:0 14px;border:0;border-radius:0;background:transparent;scrollbar-width:none}.platform-tabs::-webkit-scrollbar{display:none}.platform-tab{flex:0 0 auto;min-width:86px;min-height:44px;padding:8px 14px;border:1px solid #d8e0ed;border-right:0;background:#f8faff;font-size:14px}.platform-tab:first-child{border-radius:11px 0 0 11px}.platform-tab:last-child{border-right:1px solid #d8e0ed;border-radius:0 11px 11px 0}.platform-tab[aria-selected="true"]{min-width:auto;margin:0;border-radius:11px;box-shadow:none}.apps{border-radius:12px}.app{grid-template-columns:64px minmax(0,1fr) auto;align-items:start;gap:10px 14px;padding:20px 16px}.app-icon{grid-row:1/3}.recommendation{margin-bottom:6px}.app h3{font-size:19px}.app-description{font-size:13px}.app-status{grid-column:3;grid-row:1/3;align-self:center;font-size:13px}.app-status i{font-size:18px}.actions{grid-column:1/-1;margin-top:6px}.action-buttons{grid-template-columns:1fr 1.12fr;gap:10px}.button{padding:9px 10px;font-size:13px}.feedback{font-size:11px}.help{align-items:flex-start;gap:12px;margin-top:18px;padding:16px}.help>i{font-size:24px}.help strong{font-size:15px}.help p{font-size:12px}.help-link{align-self:center;font-size:0}.help-link i{font-size:21px}}
@media(max-width:420px){.app{grid-template-columns:58px minmax(0,1fr)}.app-icon{width:58px;height:58px}.app-status{grid-column:2;grid-row:auto;align-self:start}.actions{grid-column:1/-1}.platform-tab{min-width:82px}.auto-badge{font-size:11px}.action-buttons{grid-template-columns:1fr 1.18fr}}
</style><script src="/catalog.js" defer></script></head>
<body data-initial-platform="${initial}">
  <header class="site-header"><div class="site-header__inner"><a class="brand" href="/" aria-label="Outpost"><img src="/brand-mark.png" alt=""><span>Outpost</span></a></div></header>
  <main class="page">
    <header class="intro"><h1>Настройка подключения</h1><p>Выберите своё устройство — покажем подходящие приложения.</p></header>
    <nav class="platform-tabs" role="tablist" aria-label="Операционная система">${tabs}</nav>
    <div class="platform-panels">${panels}</div>
    <aside class="help"><i class="ph ph-info" aria-hidden="true"></i><div class="help-copy"><strong>Не знаете, что выбрать?</strong><p>Начните с первого приложения в списке — оно лучше всего подходит вашему устройству.</p></div><a class="help-link" href="${escape(baseUrl)}?format=links" target="_blank" rel="noreferrer">Открыть ручные настройки <i class="ph ph-arrow-right" aria-hidden="true"></i></a></aside>
  </main>
</body></html>`;
}

function card(app: ReturnType<typeof catalog>[number], platform: AppPlatform) {
  const primary = app.importUrl
    ? `<a class="button" href="${escape(app.importUrl)}" data-import>Добавить</a>`
    : `<button class="button" type="button" data-copy="${escape(app.subscriptionUrl)}">Добавить</button>`;
  const install = app.installUrl
    ? `<a class="button button--secondary" href="${escape(app.installUrl)}" target="_blank" rel="noreferrer">Где установить <i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>`
    : "";
  const recommended = app.recommended?.includes(platform) ? `<span class="recommendation">Рекомендуем</span>` : "";
  const tested = app.support === "tested";
  return `<article class="app" data-app="${app.id}">
    <img class="app-icon" src="${escape(app.icon)}" alt="" loading="lazy">
    <div class="app-copy">${recommended}<h3>${escape(app.name)}</h3><p class="app-description">${escape(app.description)}</p></div>
    <div class="app-status${tested ? " app-status--tested" : ""}"><i class="ph ${tested ? "ph-shield-check" : "ph-check-circle"}" aria-hidden="true"></i><span>${tested ? "Проверено" : "Совместимо"}</span></div>
    <div class="actions"><div class="action-buttons">${primary}${install}</div><span class="feedback" aria-live="polite"></span></div>
  </article>`;
}

function rank(app: AppDefinition, platform: AppPlatform | null) {
  if (platform) {
    const position = platformOrder[platform].indexOf(app.id);
    if (position >= 0) return position;
  }
  return app.support === "tested" ? 100 : 200;
}

function isPlatform(value?: string): value is AppPlatform {
  return platforms.some((platform) => platform.id === value);
}

function mihomoLink(url: string) {
  return `mihomo://install-config?url=${encodeURIComponent(url)}`;
}

function clashLink(url: string) {
  return `clash://install-config?url=${encodeURIComponent(url)}`;
}

function incyLink(url: string) {
  return `incy://import/${url}`;
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
