import type { Connection, SubscriptionFormat } from "../models";
import { metadata, type Locale } from "../../shared/i18n";

export type AppSupport = "tested" | "compatible";
export type AppPlatform = "macos" | "ios" | "android" | "windows" | "linux";
export type PricingModel = "free" | "freemium" | "paid";
export type BillingModel = "none" | "optional" | "one-time" | "subscription";
export type UpdateMode = "automatic" | "manual";
export type RouteFidelity = "exact" | "limited";

export type AppPricing = {
  model: PricingModel;
  billing: BillingModel;
  sourceUrl: string;
  verifiedAt: string;
};

export type AppDefinition = {
  id: string;
  name: string;
  technology: "Mihomo" | "sing-box" | "Xray";
  format: SubscriptionFormat;
  platforms: AppPlatform[];
  support: AppSupport;
  icon: string;
  pricing: AppPricing;
  updateMode: UpdateMode;
  routeFidelity: RouteFidelity;
  transports: string[];
  installUrls: Partial<Record<AppPlatform, string>>;
  deepLink?: (url: string) => string;
};

export type AdvancedDefinition = {
  id: string;
  format: SubscriptionFormat;
};

export const catalogVersion = 3;
export const platforms: { id: AppPlatform; label: string }[] = [
  { id: "macos", label: "macOS" },
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
  { id: "windows", label: "Windows" },
  { id: "linux", label: "Linux" },
];

const verifiedAt = "2026-08-21";
const appleEverywhere = "https://apps.apple.com/us/app/everywhere-proxy/id6766003090";
const appleIncy = "https://apps.apple.com/ru/app/incy/id6756943388";
const appleHapp = "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215";
const appleStash = "https://apps.apple.com/ru/app/stash-rule-based-proxy/id1596063349";
const githubHapp = "https://github.com/Happ-proxy/happ-desktop/releases/latest";
const githubVerge = "https://github.com/clash-verge-rev/clash-verge-rev/releases/latest";
const githubParty = "https://github.com/mihomo-party-org/clash-party/releases/latest";
const githubMeta = "https://github.com/MetaCubeX/ClashMetaForAndroid/releases/latest";
const githubFlClash = "https://github.com/chen08209/FlClash/releases/latest";
const githubV2rayN = "https://github.com/2dust/v2rayN/releases/latest";
const githubV2rayNG = "https://github.com/2dust/v2rayNG/releases/latest";
const singBoxAndroid = "https://sing-box.sagernet.org/clients/android/";
const singBoxApple = "https://sing-box.sagernet.org/clients/apple/";
const singBoxDesktop = "https://sing-box.sagernet.org/clients/desktop/";

const free = (sourceUrl: string): AppPricing => ({ model: "free", billing: "none", sourceUrl, verifiedAt });
const paid = (sourceUrl: string): AppPricing => ({ model: "paid", billing: "one-time", sourceUrl, verifiedAt });

const platformOrder: Record<AppPlatform, string[]> = {
  ios: ["everywhere", "incy", "stash", "happ"],
  macos: ["everywhere", "clash-verge", "clash-party", "happ", "incy", "stash", "v2rayn", "sing-box-apple"],
  android: ["clash-meta", "flclash", "happ", "v2rayng", "sing-box-android"],
  windows: ["clash-verge", "clash-party", "happ", "flclash", "v2rayn", "sing-box-desktop"],
  linux: ["clash-verge", "clash-party", "happ", "flclash", "v2rayn", "sing-box-desktop"],
};

export const applications: AppDefinition[] = [
  {
    id: "everywhere", name: "Everywhere Proxy", technology: "Mihomo", format: "mihomo", platforms: ["macos", "ios"], support: "tested",
    icon: "/assets/apps/everywhere.jpg", pricing: free(appleEverywhere), updateMode: "manual", routeFidelity: "exact",
    transports: ["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"], installUrls: { macos: appleEverywhere, ios: appleEverywhere },
  },
  {
    id: "incy", name: "INCY", technology: "Xray", format: "links", platforms: ["macos", "ios"], support: "tested",
    icon: "/assets/apps/incy.jpg", pricing: free(appleIncy), updateMode: "automatic", routeFidelity: "limited",
    transports: ["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"], installUrls: { macos: appleIncy, ios: appleIncy }, deepLink: incyLink,
  },
  {
    id: "stash", name: "Stash", technology: "Mihomo", format: "mihomo", platforms: ["macos", "ios"], support: "tested",
    icon: "/assets/apps/stash.svg", pricing: paid(appleStash), updateMode: "automatic", routeFidelity: "exact",
    transports: ["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"], installUrls: { macos: appleStash, ios: appleStash }, deepLink: stashLink,
  },
  {
    id: "clash-verge", name: "Clash Verge Rev", technology: "Mihomo", format: "mihomo", platforms: ["macos", "windows", "linux"], support: "tested",
    icon: "/assets/apps/clash-verge-rev.png", pricing: free(githubVerge), updateMode: "automatic", routeFidelity: "exact",
    transports: ["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"], installUrls: { macos: githubVerge, windows: githubVerge, linux: githubVerge }, deepLink: clashLink,
  },
  {
    id: "clash-party", name: "Clash Party", technology: "Mihomo", format: "mihomo", platforms: ["macos", "windows", "linux"], support: "compatible",
    icon: "/assets/apps/clash-party.svg", pricing: free(githubParty), updateMode: "automatic", routeFidelity: "exact",
    transports: ["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"], installUrls: { macos: githubParty, windows: githubParty, linux: githubParty }, deepLink: clashLink,
  },
  {
    id: "clash-meta", name: "Clash Meta for Android", technology: "Mihomo", format: "mihomo", platforms: ["android"], support: "tested",
    icon: "/assets/apps/clash-meta.svg", pricing: free(githubMeta), updateMode: "automatic", routeFidelity: "exact",
    transports: ["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"], installUrls: { android: githubMeta }, deepLink: clashMetaLink,
  },
  {
    id: "flclash", name: "FlClash", technology: "Mihomo", format: "mihomo", platforms: ["macos", "android", "windows", "linux"], support: "compatible",
    icon: "/assets/apps/flclash.png", pricing: free(githubFlClash), updateMode: "automatic", routeFidelity: "exact",
    transports: ["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"], installUrls: { macos: githubFlClash, android: githubFlClash, windows: githubFlClash, linux: githubFlClash }, deepLink: clashLink,
  },
  {
    id: "happ", name: "Happ", technology: "Xray", format: "links", platforms: ["macos", "ios", "android", "windows", "linux"], support: "compatible",
    icon: "/assets/apps/happ.jpg", pricing: free(appleHapp), updateMode: "automatic", routeFidelity: "limited",
    transports: ["Hysteria 2", "VLESS XHTTP", "VLESS gRPC"],
    installUrls: { macos: githubHapp, ios: appleHapp, android: "https://play.google.com/store/apps/details?id=com.happproxy", windows: githubHapp, linux: githubHapp },
  },
  {
    id: "sing-box-android", name: "sing-box", technology: "sing-box", format: "sing-box", platforms: ["android"], support: "tested",
    icon: "/assets/apps/sing-box.svg", pricing: free(singBoxAndroid), updateMode: "automatic", routeFidelity: "exact",
    transports: ["Hysteria 2", "VLESS gRPC"], installUrls: { android: singBoxAndroid }, deepLink: singBoxLink,
  },
  {
    id: "sing-box-apple", name: "sing-box", technology: "sing-box", format: "sing-box", platforms: ["macos"], support: "compatible",
    icon: "/assets/apps/sing-box.svg", pricing: free(singBoxApple), updateMode: "automatic", routeFidelity: "exact",
    transports: ["Hysteria 2", "VLESS gRPC"], installUrls: { macos: singBoxApple }, deepLink: singBoxLink,
  },
  {
    id: "sing-box-desktop", name: "sing-box", technology: "sing-box", format: "sing-box", platforms: ["windows", "linux"], support: "compatible",
    icon: "/assets/apps/sing-box.svg", pricing: free(singBoxDesktop), updateMode: "automatic", routeFidelity: "exact",
    transports: ["Hysteria 2", "VLESS gRPC"], installUrls: { windows: singBoxDesktop, linux: singBoxDesktop }, deepLink: singBoxLink,
  },
  {
    id: "v2rayn", name: "v2rayN", technology: "Xray", format: "xray-json", platforms: ["macos", "windows", "linux"], support: "tested",
    icon: "/assets/apps/v2rayn.png", pricing: free(githubV2rayN), updateMode: "automatic", routeFidelity: "exact",
    transports: ["VLESS XHTTP", "VLESS gRPC"], installUrls: { macos: githubV2rayN, windows: githubV2rayN, linux: githubV2rayN },
  },
  {
    id: "v2rayng", name: "v2rayNG", technology: "Xray", format: "xray-json", platforms: ["android"], support: "tested",
    icon: "/assets/apps/v2rayng.png", pricing: free(githubV2rayNG), updateMode: "automatic", routeFidelity: "exact",
    transports: ["VLESS XHTTP", "VLESS gRPC"], installUrls: { android: githubV2rayNG },
  },
];

export const advancedDefinitions: AdvancedDefinition[] = [
  { id: "vless-links", format: "links" },
  { id: "mihomo-yaml", format: "mihomo" },
  { id: "sing-box-json", format: "sing-box" },
  { id: "xray-json", format: "xray-json" },
];

export function application(id: string) {
  return applications.find((item) => item.id === id) ?? null;
}

export function advancedDefinition(id: string) {
  return advancedDefinitions.find((item) => item.id === id) ?? null;
}

export function catalog(baseUrl: string, platform?: string, language: Locale = "en") {
  const selected = isPlatform(platform) ? platform : null;
  return applications
    .filter((app) => !selected || app.platforms.includes(selected))
    .sort((left, right) => rank(left, selected) - rank(right, selected) || left.name.localeCompare(right.name))
    .map((app) => {
      const profileUrl = `${baseUrl}/apps/${app.id}`;
      const primaryFor = app.platforms.filter((item) => platformOrder[item].slice(0, 3).includes(app.id));
      const descriptions = catalogCopy[language].descriptions as Record<string, string>;
      return {
        id: app.id,
        name: app.name,
        description: descriptions[app.id] ?? app.name,
        platforms: app.platforms,
        primaryFor,
        icon: app.icon,
        pricing: app.pricing,
        updateMode: app.updateMode,
        routeFidelity: app.routeFidelity,
        transports: app.transports,
        installUrls: app.installUrls,
        installUrl: selected ? app.installUrls[selected] ?? null : null,
        profileUrl,
        qrUrl: `${baseUrl}/qr/${app.id}.svg`,
        openUrl: app.deepLink?.(profileUrl) ?? null,
      };
    });
}

export function advanced(baseUrl: string, language: Locale = "en") {
  const names = catalogCopy[language].advancedNames as Record<string, string>;
  const descriptions = catalogCopy[language].advancedDescriptions as Record<string, string>;
  return advancedDefinitions.map((item) => ({
    id: item.id,
    name: names[item.id],
    description: descriptions[item.id],
    profileUrl: `${baseUrl}/advanced/${item.id}`,
  }));
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

export function renderCatalogPage(_connection: Connection, baseUrl: string, platform: string, language: Locale = "en") {
  const copy = catalogCopy[language];
  const meta = metadata(language);
  const initial = isPlatform(platform) ? platform : "macos";
  const tabs = platforms.map(({ id, label }) => `<button class="platform-tab" type="button" role="tab" aria-selected="${id === initial}" data-platform="${id}"><span>${label}</span><span class="auto-badge" data-auto-badge hidden>${copy.auto}</span></button>`).join("");
  const panels = platforms.map(({ id, label }) => {
    const items = catalog(baseUrl, id, language);
    const primary = items.filter((app) => app.primaryFor.includes(id));
    const more = items.filter((app) => !app.primaryFor.includes(id));
    return `<section class="platform-panel" role="tabpanel" data-platform-panel="${id}"${id === initial ? "" : " hidden"}><h2 class="visually-hidden">${copy.appsFor} ${label}</h2><div class="apps">${primary.map((app) => card(app, copy, label)).join("")}</div>${more.length ? `<details class="more"><summary>${copy.more} <span>${more.length}</span></summary><div class="apps apps--more">${more.map((app) => card(app, copy, label)).join("")}</div></details>` : ""}</section>`;
  }).join("");
  const labels = { ru: "Русский", en: "English", "zh-CN": "简体中文", fa: "فارسی" };
  const languageLinks = (["ru", "en", "zh-CN", "fa"] as Locale[]).map((id) => `<a href="${escape(baseUrl)}?lang=${encodeURIComponent(id)}" lang="${id}" aria-current="${id === language ? "true" : "false"}">${labels[id]}</a>`).join("");
  const advancedItems = advanced(baseUrl, language).map((item) => `<li><div><strong>${escape(item.name ?? item.id)}</strong><span>${escape(item.description ?? item.id)}</span></div><button type="button" data-copy="${escape(item.profileUrl)}">${copy.copy}</button></li>`).join("");
  const clientMessages = escape(JSON.stringify(copy.client));

  return `<!doctype html>
<html lang="${language}" dir="${meta.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy.title} · Outpost</title><link rel="stylesheet" href="/vendor/phosphor/style.css">
<style>
:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101a3b;background:#fff;font-synthesis:none}*{box-sizing:border-box}body{margin:0;background:#fff;color:#101a3b}.site-header{min-height:64px;border-bottom:1px solid #e2e8f2}.site-header__inner,.page{width:min(1180px,calc(100% - 40px));margin:0 auto}.site-header__inner{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{display:inline-flex;align-items:center;gap:11px;color:#101a3b;font-size:21px;font-weight:760;text-decoration:none}.brand img{width:32px;height:32px}.language-switcher{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px;direction:ltr}.language-switcher a{padding:6px 8px;border-radius:7px;color:#65718e;font-size:12px;text-decoration:none}.language-switcher a[aria-current=true]{background:#e8f0ff;color:#075bea;font-weight:700}.page{padding:48px 0 72px}.intro{margin-bottom:30px}.intro h1{margin:0;font-size:clamp(34px,4vw,48px);line-height:1.08;letter-spacing:-.045em}.intro p{max-width:760px;margin:12px 0 0;color:#65718e;font-size:17px;line-height:1.55}.platform-tabs{display:grid;grid-template-columns:repeat(5,1fr);overflow:hidden;margin-bottom:28px;border:1px solid #d8e0ed;border-radius:13px;background:#f8faff}.platform-tab{position:relative;min-height:58px;display:flex;align-items:center;justify-content:center;padding:10px 18px;border:0;border-inline-end:1px solid #d8e0ed;background:transparent;color:#101a3b;font:inherit;font-size:15px;font-weight:650;cursor:pointer}.platform-tab:last-child{border-inline-end:0}.platform-tab:hover{background:#eff4fd}.platform-tab:focus-visible{outline:3px solid #9cc1ff;outline-offset:-3px}.platform-tab[aria-selected=true]{z-index:1;margin:-1px;color:#fff;background:#0b5bea;border:1px solid #0b5bea;border-radius:12px}.auto-badge{position:absolute;top:4px;inset-inline-start:5px;padding:2px 5px;border-radius:5px;background:#e8f0ff;color:#075bea;font-size:8px;font-weight:750;line-height:1.2}.platform-tab[aria-selected=true] .auto-badge{background:rgba(255,255,255,.18);color:#fff}.apps{overflow:hidden;border:1px solid #d8e0ed;border-radius:14px;background:#fff}.app{display:grid;grid-template-columns:64px minmax(210px,1fr) minmax(210px,.8fr) 230px;align-items:center;gap:22px;padding:22px 24px;border-bottom:1px solid #dfe6f0}.app:last-child{border-bottom:0}.app-icon{width:64px;height:64px;display:block;object-fit:cover;border-radius:15px;background:#fff;box-shadow:0 5px 16px rgba(24,39,75,.11)}.app-copy{min-width:0}.app-title{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.app h3{margin:0;font-size:20px;line-height:1.25}.app-description{margin:6px 0 0;color:#66728e;font-size:13px;line-height:1.45}.facts{display:grid;gap:6px;color:#53617b;font-size:12px}.fact{display:flex;align-items:center;gap:7px}.fact i{flex:0 0 auto;color:#0b5bea;font-size:17px}.fact--warning i{color:#c36a00}.technical,.transports{direction:ltr;unicode-bidi:isolate}.transports{color:#79849a;font-size:11px}.app-actions{display:grid;gap:9px}.action-buttons{display:grid;gap:6px}.button{min-height:36px;display:inline-flex;align-items:center;justify-content:center;padding:7px 10px;border:1px solid #0b5bea;border-radius:8px;background:#0b5bea;color:#fff;font:inherit;font-size:11px;font-weight:720;text-align:center;text-decoration:none;cursor:pointer}.button--secondary{background:#fff;color:#075bea}.link-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:5px 14px}.link-action{display:inline-flex;align-items:center;gap:5px;padding:2px 0;border:0;background:transparent;color:#075bea;font:inherit;font-size:10px;font-weight:700;text-decoration:none;cursor:pointer}.link-action:hover{text-decoration:underline}.link-action i{font-size:14px}.feedback{min-height:14px;color:#16824b;font-size:10px;text-align:center}.more{margin-top:14px}.more summary{width:max-content;display:flex;align-items:center;gap:7px;padding:9px 13px;border:1px solid #d8e0ed;border-radius:9px;color:#075bea;font-size:13px;font-weight:700;cursor:pointer}.more summary span{display:grid;place-items:center;min-width:21px;height:21px;border-radius:99px;background:#e8f0ff}.apps--more{margin-top:10px}.advanced{margin-top:24px;border:1px solid #d8e0ed;border-radius:13px;background:#f8faff}.advanced summary{padding:17px 20px;font-weight:750;cursor:pointer}.advanced>p{margin:0;padding:0 20px 14px;color:#66728e;font-size:13px}.advanced ul{display:grid;margin:0;padding:0 20px 18px;list-style:none}.advanced li{display:flex;align-items:center;gap:20px;padding:12px 0;border-top:1px solid #dfe6f0}.advanced li div{display:grid;gap:3px;min-width:0}.advanced li span{color:#66728e;font-size:12px}.advanced li button{margin-inline-start:auto;padding:7px 10px;border:1px solid #0b5bea;border-radius:7px;background:#fff;color:#075bea;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}[hidden]{display:none!important}
@media(max-width:900px){.app{grid-template-columns:58px minmax(0,1fr) 170px}.facts{grid-column:2}.app-actions{grid-column:3;grid-row:1/3}.app-icon{width:58px;height:58px}}
@media(max-width:640px){.site-header__inner,.page{width:min(100% - 28px,560px)}.site-header__inner{padding:9px 0}.page{padding:30px 0 44px}.intro h1{font-size:31px}.intro p{font-size:15px}.platform-tabs{display:flex;overflow-x:auto;margin:0 -14px 22px;padding:0 14px;border:0;border-radius:0;background:transparent}.platform-tab{flex:0 0 auto;min-width:86px;min-height:44px;border:1px solid #d8e0ed;background:#f8faff}.platform-tab[aria-selected=true]{margin:0;border-radius:11px}.app{grid-template-columns:52px minmax(0,1fr);gap:10px 13px;padding:18px 15px}.app-icon{width:52px;height:52px}.facts,.app-actions{grid-column:1/-1;grid-row:auto}.action-buttons{grid-template-columns:repeat(2,minmax(0,1fr))}.action-buttons>:only-child{grid-column:1/-1}.button{min-height:40px}.link-actions{justify-content:flex-start}.feedback{text-align:start}.advanced li{align-items:flex-start;flex-wrap:wrap}.advanced li button{margin-inline-start:0}}
</style><script src="/catalog.js" defer></script></head>
<body data-initial-platform="${initial}" data-messages="${clientMessages}"><header class="site-header"><div class="site-header__inner"><a class="brand" href="/" aria-label="Outpost"><img src="/brand-mark.png" alt=""><span>Outpost</span></a><nav class="language-switcher" aria-label="Language">${languageLinks}</nav></div></header><main class="page"><header class="intro"><h1>${copy.heading}</h1><p>${copy.subtitle}</p></header><nav class="platform-tabs" role="tablist" aria-label="${copy.operatingSystem}">${tabs}</nav><div class="platform-panels">${panels}</div><details class="advanced"><summary>${copy.advanced}</summary><p>${copy.advancedText}</p><ul>${advancedItems}</ul></details></main></body></html>`;
}

function card(app: ReturnType<typeof catalog>[number], copy: typeof catalogCopy[Locale], platform: string) {
  const primary = app.openUrl ? `<a class="button" href="${escape(app.openUrl)}" data-import>${copy.add}</a>` : "";
  const install = app.installUrl ? `<a class="button${app.openUrl ? " button--secondary" : ""}" href="${escape(app.installUrl)}" target="_blank" rel="noreferrer">${copy.install}</a>` : "";
  const update = app.updateMode === "automatic" ? copy.automatic : copy.manual;
  const fidelity = app.routeFidelity === "exact" ? copy.exact : copy.limited;
  return `<article class="app" data-app="${app.id}"><img class="app-icon" src="${escape(app.icon)}" alt="" loading="lazy"><div class="app-copy"><div class="app-title"><h3>${escape(app.name)}</h3></div><p class="app-description">${escape(app.description)}</p></div><div class="facts"><div class="fact"><i class="ph ph-devices" aria-hidden="true"></i><span>${copy.available} <b class="technical">${platform}</b></span></div><div class="fact${app.updateMode === "manual" ? " fact--warning" : ""}"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i><span>${update}</span></div><div class="fact"><i class="ph ph-list-checks" aria-hidden="true"></i><span>${fidelity}</span></div><div class="transports">${app.transports.join(" · ")}</div></div><div class="app-actions"><div class="action-buttons">${primary}${install}</div><div class="link-actions"><button class="link-action" type="button" data-copy="${escape(app.profileUrl)}"><i class="ph ph-copy" aria-hidden="true"></i><span>${copy.copyLink}</span></button><a class="link-action" href="${escape(app.qrUrl)}" target="_blank" rel="noreferrer"><i class="ph ph-qr-code" aria-hidden="true"></i><span>${copy.openQr}</span></a></div><span class="feedback" aria-live="polite"></span></div></article>`;
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

function clashLink(url: string) { return `clash://install-config?url=${encodeURIComponent(url)}`; }
function clashMetaLink(url: string) { return `clashmeta://install-config?url=${encodeURIComponent(url)}`; }
function stashLink(url: string) { return `stash://install-config?url=${encodeURIComponent(url)}`; }
function incyLink(url: string) { return `incy://import/${url}`; }
function singBoxLink(url: string) { return `sing-box://import-remote-profile?url=${encodeURIComponent(url)}`; }

function escape(value: unknown) {
  if (typeof value !== "string") throw new TypeError(`Catalog value must be a string, received ${String(value)}`);
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

const catalogCopy = {
  ru: {
    title: "Настройка подключения", heading: "Подключите своё устройство", subtitle: "Выберите операционную систему и проверенное приложение. Способ обновления маршрутов виден сразу.", auto: "Авто", appsFor: "Приложения для", operatingSystem: "Операционная система", more: "Ещё приложения", advanced: "Для опытных", advancedText: "Сырые профили для ручного импорта. Отдельные URI не содержат маршрутов Outpost.", add: "Открыть в приложении", copy: "Скопировать профиль", copyLink: "Скопировать ссылку", openQr: "Открыть QR-код", install: "Установить", available: "Доступно для", automatic: "Маршруты обновляются автоматически", manual: "Маршруты обновляются вручную", exact: "Точный порядок маршрутов", limited: "Маршруты сгруппированы по действиям", client: { opening: "Открываем приложение…", copied: "Ссылка скопирована — вставьте её в приложение", copyFailed: "Не удалось скопировать ссылку" },
    descriptions: { everywhere: "Самый простой Apple-клиент; профиль обновляется вручную.", incy: "Бесплатный Apple-клиент с обновляемой подпиской.", stash: "Точное автоматическое обновление маршрутов на iPhone и iPad.", "clash-verge": "Популярный настольный клиент Mihomo.", "clash-party": "Компактный Mihomo-клиент для компьютера.", "clash-meta": "Проверенный Mihomo-клиент для Android.", flclash: "Лёгкий кроссплатформенный Mihomo-клиент.", happ: "Простой бесплатный кроссплатформенный клиент.", "sing-box-android": "Официальный клиент sing-box для Android.", "sing-box-apple": "Официальный клиент sing-box для macOS.", "sing-box-desktop": "Официальный профиль sing-box для компьютера.", v2rayn: "Полная обновляемая конфигурация Xray.", v2rayng: "Полная обновляемая конфигурация Xray для Android." },
    advancedNames: { "vless-links": "Ссылки подключений", "mihomo-yaml": "Mihomo YAML", "sing-box-json": "sing-box JSON", "xray-json": "Xray JSON" }, advancedDescriptions: { "vless-links": "Отдельные URI не содержат маршрутов.", "mihomo-yaml": "Полный профиль Mihomo для ручного импорта.", "sing-box-json": "Полный профиль sing-box для ручного импорта.", "xray-json": "Полная конфигурация Xray для ручного импорта." },
  },
  en: {
    title: "Connection setup", heading: "Connect your device", subtitle: "Choose an operating system and a verified app. Route update behavior is shown up front.", auto: "Auto", appsFor: "Apps for", operatingSystem: "Operating system", more: "More apps", advanced: "For advanced users", advancedText: "Raw profiles for manual import. Individual URIs do not contain Outpost routes.", add: "Open in app", copy: "Copy profile", copyLink: "Copy link", openQr: "Open QR code", install: "Install", available: "Available for", automatic: "Routes update automatically", manual: "Routes update manually", exact: "Exact route order", limited: "Routes grouped by action", client: { opening: "Opening the app…", copied: "Link copied—paste it into the app", copyFailed: "Could not copy the link" },
    descriptions: { everywhere: "The simplest Apple client; refresh the profile manually.", incy: "A free Apple client with an updating subscription.", stash: "Exact automatic route updates on iPhone and iPad.", "clash-verge": "A popular Mihomo desktop client.", "clash-party": "A compact Mihomo desktop client.", "clash-meta": "A proven Mihomo client for Android.", flclash: "A lightweight cross-platform Mihomo client.", happ: "A simple free cross-platform client.", "sing-box-android": "The official sing-box client for Android.", "sing-box-apple": "The official sing-box client for macOS.", "sing-box-desktop": "The official sing-box desktop profile.", v2rayn: "A complete updating Xray configuration.", v2rayng: "A complete updating Xray configuration for Android." },
    advancedNames: { "vless-links": "Connection links", "mihomo-yaml": "Mihomo YAML", "sing-box-json": "sing-box JSON", "xray-json": "Xray JSON" }, advancedDescriptions: { "vless-links": "Individual URIs do not contain routes.", "mihomo-yaml": "Complete Mihomo profile for manual import.", "sing-box-json": "Complete sing-box profile for manual import.", "xray-json": "Complete Xray configuration for manual import." },
  },
  "zh-CN": {
    title: "连接设置", heading: "连接您的设备", subtitle: "选择操作系统和经过验证的应用。路由更新方式会直接显示。", auto: "自动", appsFor: "适用于", operatingSystem: "操作系统", more: "更多应用", advanced: "高级选项", advancedText: "用于手动导入的原始配置。单独 URI 不包含 Outpost 路由。", add: "在应用中打开", copy: "复制配置", copyLink: "复制链接", openQr: "打开 QR 码", install: "安装", available: "可用于", automatic: "路由自动更新", manual: "路由需手动更新", exact: "精确的路由顺序", limited: "路由按操作分组", client: { opening: "正在打开应用…", copied: "链接已复制，请粘贴到应用中", copyFailed: "无法复制链接" },
    descriptions: { everywhere: "最简单的 Apple 客户端；配置需手动更新。", incy: "支持更新订阅的免费 Apple 客户端。", stash: "在 iPhone 和 iPad 上精确自动更新路由。", "clash-verge": "流行的 Mihomo 桌面客户端。", "clash-party": "轻巧的 Mihomo 桌面客户端。", "clash-meta": "经过验证的 Android Mihomo 客户端。", flclash: "轻量级跨平台 Mihomo 客户端。", happ: "简单免费的跨平台客户端。", "sing-box-android": "官方 sing-box Android 客户端。", "sing-box-apple": "官方 sing-box macOS 客户端。", "sing-box-desktop": "官方 sing-box 桌面配置。", v2rayn: "完整且可更新的 Xray 配置。", v2rayng: "适用于 Android 的完整可更新 Xray 配置。" },
    advancedNames: { "vless-links": "连接链接", "mihomo-yaml": "Mihomo YAML", "sing-box-json": "sing-box JSON", "xray-json": "Xray JSON" }, advancedDescriptions: { "vless-links": "单独 URI 不包含路由。", "mihomo-yaml": "用于手动导入的完整 Mihomo 配置。", "sing-box-json": "用于手动导入的完整 sing-box 配置。", "xray-json": "用于手动导入的完整 Xray 配置。" },
  },
  fa: {
    title: "راه‌اندازی اتصال", heading: "دستگاه خود را متصل کنید", subtitle: "سیستم‌عامل و یک برنامهٔ بررسی‌شده را انتخاب کنید. روش به‌روزرسانی مسیرها همان ابتدا نمایش داده می‌شود.", auto: "خودکار", appsFor: "برنامه‌ها برای", operatingSystem: "سیستم‌عامل", more: "برنامه‌های بیشتر", advanced: "برای کاربران حرفه‌ای", advancedText: "پروفایل‌های خام برای ورود دستی. URIهای جداگانه شامل مسیرهای Outpost نیستند.", add: "باز کردن در برنامه", copy: "کپی پروفایل", copyLink: "کپی پیوند", openQr: "باز کردن کد QR", install: "نصب", available: "در دسترس برای", automatic: "مسیرها خودکار به‌روزرسانی می‌شوند", manual: "مسیرها دستی به‌روزرسانی می‌شوند", exact: "ترتیب دقیق مسیرها", limited: "مسیرها بر اساس عمل گروه‌بندی می‌شوند", client: { opening: "در حال باز کردن برنامه…", copied: "پیوند کپی شد؛ آن را در برنامه جای‌گذاری کنید", copyFailed: "کپی پیوند انجام نشد" },
    descriptions: { everywhere: "ساده‌ترین کلاینت Apple؛ پروفایل دستی به‌روزرسانی می‌شود.", incy: "کلاینت رایگان Apple با اشتراک قابل به‌روزرسانی.", stash: "به‌روزرسانی خودکار و دقیق مسیرها در iPhone و iPad.", "clash-verge": "کلاینت محبوب دسکتاپ Mihomo.", "clash-party": "کلاینت جمع‌وجور دسکتاپ Mihomo.", "clash-meta": "کلاینت آزموده‌شدهٔ Mihomo برای Android.", flclash: "کلاینت سبک و چندسکویی Mihomo.", happ: "کلاینت ساده، رایگان و چندسکویی.", "sing-box-android": "کلاینت رسمی sing-box برای Android.", "sing-box-apple": "کلاینت رسمی sing-box برای macOS.", "sing-box-desktop": "پروفایل رسمی دسکتاپ sing-box.", v2rayn: "پیکربندی کامل و قابل به‌روزرسانی Xray.", v2rayng: "پیکربندی کامل و قابل به‌روزرسانی Xray برای Android." },
    advancedNames: { "vless-links": "پیوندهای اتصال", "mihomo-yaml": "Mihomo YAML", "sing-box-json": "sing-box JSON", "xray-json": "Xray JSON" }, advancedDescriptions: { "vless-links": "URIهای جداگانه شامل مسیرها نیستند.", "mihomo-yaml": "پروفایل کامل Mihomo برای ورود دستی.", "sing-box-json": "پروفایل کامل sing-box برای ورود دستی.", "xray-json": "پیکربندی کامل Xray برای ورود دستی." },
  },
} satisfies Record<Locale, { title: string; heading: string; subtitle: string; auto: string; appsFor: string; operatingSystem: string; more: string; advanced: string; advancedText: string; add: string; copy: string; copyLink: string; openQr: string; install: string; available: string; automatic: string; manual: string; exact: string; limited: string; client: Record<string, string>; descriptions: Record<string, string>; advancedNames: Record<string, string>; advancedDescriptions: Record<string, string> }>;
