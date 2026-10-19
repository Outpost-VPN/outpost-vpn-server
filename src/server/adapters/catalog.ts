import {protocols, type ProtocolId} from "../../shared/protocols";
import type {EngineId} from "../../shared/engines";
import { clientProfiles, clientProfileFormat, clientProfileRequirements, compatibleMethods, type ConnectionMethod, type ClientProfile } from "../../shared/connection-methods";
import type { Connection, SubscriptionFormat } from "../models";
import { metadata, type Locale } from "../../shared/i18n";
import {ServiceError} from "../services/connections";

export type AppSupport = "tested" | "compatible";
export type AppPlatform = "macos" | "ios" | "android" | "windows" | "linux";
export type PricingModel = "free" | "freemium" | "paid";
export type BillingModel = "none" | "optional" | "one-time" | "subscription";
export type UpdateMode = "automatic" | "manual";
export type RouteFidelity = "exact" | "limited";
type ProtocolRequirement = {protocol: ProtocolId; name: string; requirement: string};

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
  installUrls: Partial<Record<AppPlatform, string>>;
  deepLink?: (url: string) => string;
  modern?: {
    profile: ClientProfile;
    protocols: readonly ProtocolId[];
    requirements?: Partial<Record<ProtocolId, string>>;
  };
};

export type AdvancedDefinition = {
  id: string;
  format: SubscriptionFormat;
  clientProfile?: ClientProfile;
};

export const catalogVersion = 7;
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
const singBoxAppleStore = "https://apps.apple.com/us/app/sing-box-mt/id6785326793";
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
    modern: {profile: "mihomo-modern", protocols: ["anytls", "trusttunnel"]},
    icon: "/assets/apps/everywhere.jpg", pricing: free(appleEverywhere), updateMode: "manual", routeFidelity: "exact",
    installUrls: { macos: appleEverywhere, ios: appleEverywhere },
  },
  {
    id: "incy", name: "INCY", technology: "Xray", format: "links", platforms: ["macos", "ios"], support: "tested",
    icon: "/assets/apps/incy.jpg", pricing: free(appleIncy), updateMode: "automatic", routeFidelity: "limited",
    installUrls: { macos: appleIncy, ios: appleIncy }, deepLink: incyLink,
  },
  {
    id: "stash", name: "Stash", technology: "Mihomo", format: "mihomo", platforms: ["macos", "ios"], support: "tested",
    modern: {profile: "mihomo-modern", protocols: ["anytls", "trusttunnel"], requirements: {anytls: "Stash iOS ≥3.3.0 / macOS ≥4.1.0", trusttunnel: "Stash iOS ≥3.4.0 / macOS ≥4.2.0"}},
    icon: "/assets/apps/stash.svg", pricing: paid(appleStash), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { macos: appleStash, ios: appleStash }, deepLink: stashLink,
  },
  {
    id: "clash-verge", name: "Clash Verge Rev", technology: "Mihomo", format: "mihomo", platforms: ["macos", "windows", "linux"], support: "tested",
    modern: {profile: "mihomo-modern", protocols: ["anytls", "trusttunnel", "amneziawg"]},
    icon: "/assets/apps/clash-verge-rev.png", pricing: free(githubVerge), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { macos: githubVerge, windows: githubVerge, linux: githubVerge }, deepLink: clashLink,
  },
  {
    id: "clash-party", name: "Clash Party", technology: "Mihomo", format: "mihomo", platforms: ["macos", "windows", "linux"], support: "compatible",
    modern: {profile: "mihomo-modern", protocols: ["anytls", "trusttunnel", "amneziawg"]},
    icon: "/assets/apps/clash-party.svg", pricing: free(githubParty), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { macos: githubParty, windows: githubParty, linux: githubParty }, deepLink: clashLink,
  },
  {
    id: "clash-meta", name: "Clash Meta for Android", technology: "Mihomo", format: "mihomo", platforms: ["android"], support: "tested",
    modern: {profile: "mihomo-modern", protocols: ["anytls", "trusttunnel", "amneziawg"]},
    icon: "/assets/apps/clash-meta.svg", pricing: free(githubMeta), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { android: githubMeta }, deepLink: clashMetaLink,
  },
  {
    id: "flclash", name: "FlClash", technology: "Mihomo", format: "mihomo", platforms: ["macos", "android", "windows", "linux"], support: "compatible",
    modern: {profile: "mihomo-modern", protocols: ["anytls", "trusttunnel", "amneziawg"]},
    icon: "/assets/apps/flclash.png", pricing: free(githubFlClash), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { macos: githubFlClash, android: githubFlClash, windows: githubFlClash, linux: githubFlClash }, deepLink: clashLink,
  },
  {
    id: "happ", name: "Happ", technology: "Xray", format: "links", platforms: ["macos", "ios", "android", "windows", "linux"], support: "compatible",
    icon: "/assets/apps/happ.jpg", pricing: free(appleHapp), updateMode: "automatic", routeFidelity: "limited",
    installUrls: { macos: githubHapp, ios: appleHapp, android: "https://play.google.com/store/apps/details?id=com.happproxy", windows: githubHapp, linux: githubHapp },
  },
  {
    id: "sing-box-android", name: "sing-box", technology: "sing-box", format: "sing-box", platforms: ["android"], support: "tested",
    modern: {profile: "sing-box-modern", protocols: ["anytls", "naive"]},
    icon: "/assets/apps/sing-box.svg", pricing: free(singBoxAndroid), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { android: singBoxAndroid }, deepLink: singBoxLink,
  },
  {
    id: "sing-box-apple", name: "sing-box", technology: "sing-box", format: "sing-box", platforms: ["macos", "ios"], support: "compatible",
    modern: {profile: "sing-box-modern", protocols: ["anytls", "naive"]},
    icon: "/assets/apps/sing-box.svg", pricing: free(singBoxApple), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { macos: singBoxApple, ios: singBoxAppleStore }, deepLink: singBoxLink,
  },
  {
    id: "sing-box-desktop", name: "sing-box", technology: "sing-box", format: "sing-box", platforms: ["windows", "linux"], support: "compatible",
    modern: {profile: "sing-box-modern", protocols: ["anytls", "naive"]},
    icon: "/assets/apps/sing-box.svg", pricing: free(singBoxDesktop), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { windows: singBoxDesktop, linux: singBoxDesktop }, deepLink: singBoxLink,
  },
  {
    id: "v2rayn", name: "v2rayN", technology: "Xray", format: "xray-json", platforms: ["macos", "windows", "linux"], support: "tested",
    icon: "/assets/apps/v2rayn.png", pricing: free(githubV2rayN), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { macos: githubV2rayN, windows: githubV2rayN, linux: githubV2rayN },
  },
  {
    id: "v2rayng", name: "v2rayNG", technology: "Xray", format: "xray-json", platforms: ["android"], support: "tested",
    icon: "/assets/apps/v2rayng.png", pricing: free(githubV2rayNG), updateMode: "automatic", routeFidelity: "exact",
    installUrls: { android: githubV2rayNG },
  },
];

export const advancedDefinitions: AdvancedDefinition[] = [
  { id: "vless-links", format: "links" },
  { id: "mihomo-yaml", format: "mihomo" },
  { id: "sing-box-json", format: "sing-box" },
  { id: "xray-json", format: "xray-json" },
  { id: "mihomo-modern", format: "mihomo", clientProfile: "mihomo-modern" },
  { id: "sing-box-modern", format: "sing-box", clientProfile: "sing-box-modern" },
  { id: "amneziawg-conf", format: "amneziawg" },
  { id: "naive-json", format: "naive" },
];

export function application(id: string) {
  return applications.find((item) => item.id === id) ?? null;
}

export class ApplicationProfile {
  readonly clientProfile: ClientProfile;
  readonly protocols?: readonly ProtocolId[];

  constructor(readonly app: AppDefinition, private readonly variant?: string | null) {
    if (variant && (variant !== "modern" || !app.modern)) throw new ServiceError(400, "Client profile does not match the subscription format");
    this.clientProfile = variant ? app.modern!.profile : app.format;
    if (variant) this.protocols = [...new Set<ProtocolId>([...clientProfiles[app.format].protocols, ...app.modern!.protocols])];
  }

  get format() { return clientProfileFormat(this.clientProfile) as SubscriptionFormat; }
  get appId() { return this.app.id; }
  private get query() { return this.variant ? "?profile=modern" : ""; }
  url(baseUrl: string) { return `${baseUrl}/apps/${this.app.id}${this.query}`; }
  qr(baseUrl: string) { return `${baseUrl}/qr/${this.app.id}.svg${this.query}`; }

  support(language: Locale, available?: MethodAvailability) {
    const support = profileSupport(this.clientProfile, language, available, this.app.routeFidelity, this.protocols);
    if (!this.variant) return support;
    const versions = support.protocolRequirements.map((item) => ({...item, requirement: this.app.modern!.requirements?.[item.protocol] ?? item.requirement}));
    return {...support, protocolRequirements: versions, requirements: versions.map((item) => `${item.name}: ${item.requirement}`).join("; ")};
  }
}

export function advancedDefinition(id: string) {
  return advancedDefinitions.find((item) => item.id === id) ?? null;
}

export type MethodAvailability = { methods: readonly ConnectionMethod[]; installed: readonly EngineId[] };

function profileSupport(profile: ClientProfile, language: Locale, available?: MethodAvailability, fidelity: RouteFidelity = "exact", selectedProtocols?: readonly ProtocolId[]) {
  const selected = available ? compatibleMethods(available.methods, profile, available.installed, selectedProtocols).map((method) => method.protocol)
    : clientProfiles[profile].protocols.filter((protocol) => !selectedProtocols || selectedProtocols.includes(protocol));
  const supported = [...new Set(selected)];
  const mode = clientProfiles[profile].routing;
  const support = mode === "none" ? "none" : mode === "client" || fidelity === "limited" ? "limited" : "full";
  return {
    transports: supported.map((protocol) => protocols[protocol].name),
    requirements: clientProfileRequirements(profile, supported),
    protocolRequirements: supported.flatMap((protocol): ProtocolRequirement[] => {
      const requirement = clientProfileRequirements(profile, [protocol]);
      return requirement ? [{protocol, name: protocols[protocol].name, requirement}] : [];
    }),
    routing: { support, ...catalogCopy[language].routing[support] },
  };
}

export function catalog(baseUrl: string, platform?: string, language: Locale = "en", available?: MethodAvailability) {
  const selected = isPlatform(platform) ? platform : null;
  const items = applications
    .filter((app) => !selected || app.platforms.includes(selected))
    .sort((left, right) => rank(left, selected) - rank(right, selected) || left.name.localeCompare(right.name))
    .map((app) => {
      let profile = new ApplicationProfile(app);
      let support = profile.support(language, available);
      if (app.modern) {
        const candidate = new ApplicationProfile(app, "modern");
        const modern = candidate.support(language, available);
        if (modern.transports.length > support.transports.length) {
          support = modern;
          profile = candidate;
        }
      }
      const profileUrl = profile.url(baseUrl);
      const descriptions = catalogCopy[language].descriptions as Record<string, string>;
      return {
        id: app.id,
        name: app.name,
        description: descriptions[app.id] ?? app.name,
        platforms: app.platforms,
        icon: app.icon,
        pricing: app.pricing,
        updateMode: app.updateMode,
        routeFidelity: app.routeFidelity,
        ...support,
        installUrls: app.installUrls,
        installUrl: selected ? app.installUrls[selected] ?? null : null,
        profileUrl,
        qrUrl: profile.qr(baseUrl),
        openUrl: app.deepLink?.(profileUrl) ?? null,
      };
    }).filter((app) => app.transports.length > 0);
  const availableIds = new Set(items.map((item) => item.id));
  const primary = new Map(platforms.map(({id}) => [id, applications.filter((app) => availableIds.has(app.id) && app.platforms.includes(id))
    .sort((left, right) => rank(left, id) - rank(right, id)).slice(0, 3).map((app) => app.id)]));
  return items.map((app) => ({...app, primaryFor: app.platforms.filter((platform) => primary.get(platform)!.includes(app.id))}));
}

export function advanced(baseUrl: string, language: Locale = "en", available?: MethodAvailability) {
  const names = catalogCopy[language].advancedNames as Record<string, string>;
  const descriptions = catalogCopy[language].advancedDescriptions as Record<string, string>;
  return advancedDefinitions.flatMap((item) => {
    const profile = item.clientProfile ?? item.format;
    const support = profileSupport(profile, language, available);
    if (!support.transports.length) return [];
    return [{id: item.id, name: names[item.id] ?? clientProfiles[profile].name,
      description: descriptions[item.id] ?? catalogCopy[language].modernText,
      ...support,
      profileUrl: `${baseUrl}/advanced/${item.id}`,
    }];
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

export function renderCatalogPage(_connection: Connection, baseUrl: string, platform: string, language: Locale = "en", available?: MethodAvailability) {
  const copy = catalogCopy[language];
  const meta = metadata(language);
  const initial = isPlatform(platform) ? platform : "macos";
  const choices = new Map(platforms.map(({id}) => [id, catalog(baseUrl, id, language, available)]));
  const tabs = platforms.map(({ id, label }) => `<button class="platform-tab" type="button" role="tab" aria-selected="${id === initial}" data-platform="${id}"><span>${label}</span><span class="auto-badge" data-auto-badge hidden>${copy.auto}</span></button>`).join("");
  const panels = platforms.map(({ id, label }) => {
    const items = choices.get(id)!;
    const primary = items.filter((app) => app.primaryFor.includes(id));
    const more = items.filter((app) => !app.primaryFor.includes(id));
    return `<section class="platform-panel" role="tabpanel" data-platform-panel="${id}"${id === initial ? "" : " hidden"}><h2 class="visually-hidden">${copy.appsFor} ${label}</h2>${!items.length ? `<p class="empty-apps">${copy.unavailable}</p>` : ""}<div class="apps"${!primary.length ? " hidden" : ""}>${primary.map((app) => card(app, copy)).join("")}</div>${more.length ? `<details class="more"><summary>${copy.more} <span>${more.length}</span></summary><div class="apps apps--more">${more.map((app) => card(app, copy)).join("")}</div></details>` : ""}</section>`;
  }).join("");
  const labels = { ru: "Русский", en: "English", "zh-CN": "简体中文", fa: "فارسی" };
  const languageLinks = (["ru", "en", "zh-CN", "fa"] as Locale[]).map((id) => `<a href="${escape(baseUrl)}?lang=${encodeURIComponent(id)}" lang="${id}" aria-current="${id === language ? "true" : "false"}">${labels[id]}</a>`).join("");
  const advancedItems = advanced(baseUrl, language, available).map((item) => `<li><div class="profile-copy"><strong class="technical">${escape(item.name)}</strong><p>${escape(item.description)}</p></div>${compatibility(item, copy)}<button type="button" data-copy="${escape(item.profileUrl)}">${copy.copy}</button></li>`).join("");
  const clientMessages = escape(JSON.stringify(copy.client));

  return `<!doctype html>
<html lang="${language}" dir="${meta.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy.title} · Outpost</title><link rel="stylesheet" href="/vendor/phosphor/style.css">
<style>
:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101a3b;background:#fff;font-synthesis:none}*{box-sizing:border-box}body{margin:0;background:#fff;color:#101a3b}.site-header{min-height:64px;border-bottom:1px solid #e2e8f2}.site-header__inner,.page{width:min(1180px,calc(100% - 40px));margin:0 auto}.site-header__inner{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{display:inline-flex;align-items:center;gap:11px;color:#101a3b;font-size:21px;font-weight:760;text-decoration:none}.brand img{width:32px;height:32px}.language-switcher{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px;direction:ltr}.language-switcher a{padding:6px 8px;border-radius:7px;color:#65718e;font-size:12px;text-decoration:none}.language-switcher a[aria-current=true]{background:#e8f0ff;color:#075bea;font-weight:700}.page{padding:48px 0 72px}.intro{margin-bottom:30px}.intro h1{margin:0;font-size:clamp(34px,4vw,48px);line-height:1.08;letter-spacing:-.045em}.intro p{max-width:760px;margin:12px 0 0;color:#65718e;font-size:17px;line-height:1.55}.platform-tabs{display:grid;grid-template-columns:repeat(5,1fr);overflow:hidden;margin-bottom:28px;border:1px solid #d8e0ed;border-radius:13px;background:#f8faff}.platform-tab{position:relative;min-height:58px;display:flex;align-items:center;justify-content:center;padding:10px 18px;border:0;border-inline-end:1px solid #d8e0ed;background:transparent;color:#101a3b;font:inherit;font-size:15px;font-weight:650;cursor:pointer}.platform-tab:last-child{border-inline-end:0}.platform-tab:hover{background:#eff4fd}.platform-tab:focus-visible{outline:3px solid #9cc1ff;outline-offset:-3px}.platform-tab[aria-selected=true]{z-index:1;color:#fff;background:#0b5bea}.auto-badge{position:absolute;top:4px;inset-inline-start:5px;padding:2px 5px;border-radius:5px;background:#e8f0ff;color:#075bea;font-size:8px;font-weight:750;line-height:1.2}.platform-tab[aria-selected=true] .auto-badge{background:rgba(255,255,255,.18);color:#fff}.apps{overflow:hidden;border:1px solid #d8e0ed;border-radius:14px;background:#fff}.app{display:grid;grid-template-columns:56px minmax(190px,1fr) minmax(250px,1.15fr) 200px;align-items:center;gap:22px;padding:22px 24px;border-bottom:1px solid #dfe6f0}.app:last-child{border-bottom:0}.app-icon{width:56px;height:56px;display:block;object-fit:cover;border-radius:15px;background:#fff;box-shadow:0 5px 16px rgba(24,39,75,.11)}.app-copy{min-width:0}.app-title{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.app h3{margin:0;font-size:20px;line-height:1.25}.app-description{margin:6px 0 0;color:#66728e;font-size:13px;line-height:1.45}.compatibility{display:grid;gap:12px;min-width:0;font-size:12px;line-height:1.5}
.fact-label{display:block;margin-bottom:6px;color:#65718e;font-size:11px}
.technical,.transports{direction:ltr;unicode-bidi:isolate}
.transports{display:flex;flex-wrap:wrap;gap:5px;margin:0;padding:0;list-style:none}
.transports li{padding:3px 7px;border-radius:5px;background:#f0f4fa;color:#263651;font-size:11px;font-weight:600}
.route-support{display:flex;align-items:flex-start;gap:7px;color:#16824b}
.route-support i{margin-top:2px;font-size:17px}
.route-support strong{font-size:12px;font-weight:650}
.route-support p{margin:3px 0 0;color:#65718e;font-size:11px}
.route-support--limited{color:#a25c00}.route-support--none{color:#65718e}
.requirements{margin:0;color:#65718e;font-size:11px}.versions{display:grid;gap:3px;margin:0;padding:0;list-style:none}.versions b{font-weight:600;color:#263651}
.update{display:flex;align-items:flex-start;gap:6px;margin:10px 0 0;color:#65718e;font-size:11px;line-height:1.5}
.update i{font-size:14px;color:#16824b}.update--manual i{color:#a25c00}
.empty-apps{padding:20px;border:1px solid #d8e0ed;border-radius:12px;color:#65718e;line-height:1.5}
.app-actions{display:grid;gap:9px}.action-buttons{display:grid;gap:6px}.button{min-height:36px;display:inline-flex;align-items:center;justify-content:center;padding:7px 10px;border:1px solid #0b5bea;border-radius:8px;background:#0b5bea;color:#fff;font:inherit;font-size:11px;font-weight:720;text-align:center;text-decoration:none;cursor:pointer}.button--secondary{background:#fff;color:#075bea}.link-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:5px 14px}.link-action{display:inline-flex;align-items:center;gap:5px;padding:2px 0;border:0;background:transparent;color:#075bea;font:inherit;font-size:10px;font-weight:700;text-decoration:none;cursor:pointer}.link-action:hover{text-decoration:underline}.link-action i{font-size:14px}.feedback{min-height:14px;color:#16824b;font-size:10px;text-align:center}.more{margin-top:14px}.more summary{width:max-content;display:flex;align-items:center;gap:7px;padding:9px 13px;border:1px solid #d8e0ed;border-radius:9px;color:#075bea;font-size:13px;font-weight:700;cursor:pointer}.more summary span{display:grid;place-items:center;min-width:21px;height:21px;border-radius:99px;background:#e8f0ff}.apps--more{margin-top:10px}.advanced{margin-top:24px;border:1px solid #d8e0ed;border-radius:13px;background:#f8faff}.advanced summary{padding:17px 20px;font-weight:750;cursor:pointer}.advanced>p{margin:0;padding:0 20px 14px;color:#66728e;font-size:13px}.advanced ul{display:grid;margin:0;padding:0 20px 18px;list-style:none}.advanced li{display:grid;grid-template-columns:minmax(160px,.9fr) minmax(250px,1.2fr) auto;align-items:center;gap:20px;padding:12px 0;border-top:1px solid #dfe6f0}.profile-copy{min-width:0}.profile-copy>p{margin:5px 0 0;color:#66728e;font-size:12px;line-height:1.5}.advanced li button{margin-inline-start:auto;padding:7px 10px;border:1px solid #0b5bea;border-radius:7px;background:#fff;color:#075bea;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}[hidden]{display:none!important}
@media(max-width:900px){.app{grid-template-columns:58px minmax(0,1fr) 170px}.app>.compatibility{grid-column:2}.app-actions{grid-column:3;grid-row:1/3}.app-icon{width:58px;height:58px}}
@media(max-width:640px){.site-header__inner,.page{width:min(100% - 28px,560px)}.site-header__inner{padding:9px 0}.page{padding:30px 0 44px}.intro h1{font-size:31px}.intro p{font-size:15px}.platform-tabs{display:flex;gap:6px;overflow-x:auto;margin:0 -14px 22px;padding:0 14px;border:0;border-radius:0;background:transparent}.platform-tab{flex:0 0 auto;min-width:86px;min-height:44px;border:1px solid #d8e0ed;border-radius:11px;background:#f8faff}.app{grid-template-columns:52px minmax(0,1fr);gap:10px 13px;padding:18px 15px}.app-icon{width:52px;height:52px}.app>.compatibility,.app-actions{grid-column:1/-1;grid-row:auto}.action-buttons{grid-template-columns:repeat(2,minmax(0,1fr))}.action-buttons>:only-child{grid-column:1/-1}.button{min-height:40px}.link-actions{justify-content:flex-start}.feedback{text-align:start}.advanced li{grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}.advanced li button{margin-inline-start:0}}
</style><script src="/catalog.js" defer></script></head>
<body data-initial-platform="${initial}" data-messages="${clientMessages}"><header class="site-header"><div class="site-header__inner"><a class="brand" href="/" aria-label="Outpost"><img src="/brand-mark.png" alt=""><span>Outpost</span></a><nav class="language-switcher" aria-label="Language">${languageLinks}</nav></div></header><main class="page"><header class="intro"><h1>${copy.heading}</h1><p>${copy.subtitle}</p></header><nav class="platform-tabs" role="tablist" aria-label="${copy.operatingSystem}">${tabs}</nav><div class="platform-panels">${panels}</div><details class="advanced"${!choices.get(initial)!.length ? " open" : ""}><summary>${copy.advanced}</summary><p>${copy.advancedText}</p><ul>${advancedItems}</ul></details></main></body></html>`;
}

function compatibility(profile: ReturnType<typeof profileSupport>, copy: typeof catalogCopy[Locale]) {
  const {routing} = profile;
  const methods = profile.transports.map((name) => `<li>${escape(name)}</li>`).join("");
  const versions = profile.protocolRequirements.map((item) => `<li><b class="technical">${escape(item.name)}:</b> <span class="technical">${escape(item.requirement)}</span></li>`).join("");
  const requirements = versions ? `<div class="requirements"><span class="fact-label">${copy.requirements}</span><ul class="versions">${versions}</ul></div>`
    : profile.requirements ? `<p class="requirements"><b>${copy.requirements}:</b> <span class="technical">${escape(profile.requirements)}</span></p>` : "";
  return `<div class="compatibility"><div class="methods"><span class="fact-label">${copy.methods}</span><ul class="transports">${methods}</ul></div>${requirements}<div class="route-support route-support--${routing.support}"><i class="ph ph-path" aria-hidden="true"></i><div><strong>${escape(routing.label)}</strong><p>${escape(routing.detail)}</p></div></div></div>`;
}

function card(app: ReturnType<typeof catalog>[number], copy: typeof catalogCopy[Locale]) {
  const primary = app.openUrl ? `<a class="button" href="${escape(app.openUrl)}" data-import>${copy.add}</a>` : "";
  const install = app.installUrl ? `<a class="button${app.openUrl ? " button--secondary" : ""}" href="${escape(app.installUrl)}" target="_blank" rel="noreferrer">${copy.install}</a>` : "";
  const update = app.updateMode === "automatic" ? copy.automatic : copy.manual;
  return `<article class="app" data-app="${app.id}"><img class="app-icon" src="${escape(app.icon)}" alt="" loading="lazy"><div class="app-copy"><div class="app-title"><h3>${escape(app.name)}</h3></div><p class="app-description">${escape(app.description)}</p><p class="update${app.updateMode === "manual" ? " update--manual" : ""}"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>${update}</p></div>${compatibility(app, copy)}<div class="app-actions"><div class="action-buttons">${primary}${install}</div><div class="link-actions"><button class="link-action" type="button" data-copy="${escape(app.profileUrl)}"><i class="ph ph-copy" aria-hidden="true"></i><span>${copy.copyLink}</span></button><a class="link-action" href="${escape(app.qrUrl)}" target="_blank" rel="noreferrer"><i class="ph ph-qr-code" aria-hidden="true"></i><span>${copy.openQr}</span></a></div><span class="feedback" aria-live="polite"></span></div></article>`;
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
    methods: "Способы подключения",
    requirements: "Версии клиента и его движка",
    routing: {"full": {"label": "Маршруты Outpost — полностью", "detail": "Все правила и их порядок сохраняются."}, "limited": {"label": "Маршруты Outpost — с ограничениями", "detail": "Правила группируются по действиям; их порядок может измениться."}, "none": {"label": "Без маршрутов Outpost", "detail": "В файле только настройки подключения."}},

    unavailable: "Для доступных способов выберите совместимый профиль в разделе «Для опытных». Если профилей нет, обратитесь к владельцу сервера.",
    modernText: "Профиль для ручного импорта в клиент с указанными возможностями.",
    title: "Настройка подключения", heading: "Подключите своё устройство", subtitle: "Выберите приложение для своего устройства. Здесь показаны доступные способы подключения и поддержка маршрутов Outpost.", auto: "Авто", appsFor: "Приложения для", operatingSystem: "Операционная система", more: "Ещё приложения", advanced: "Для опытных", advancedText: "Сырые профили для ручного импорта. Отдельные URI не содержат маршрутов Outpost.", add: "Открыть в приложении", copy: "Скопировать профиль", copyLink: "Скопировать ссылку", openQr: "Открыть QR-код", install: "Установить", automatic: "Маршруты обновляются автоматически", manual: "Маршруты обновляются вручную", client: { opening: "Открываем приложение…", copied: "Ссылка скопирована — вставьте её в приложение", copyFailed: "Не удалось скопировать ссылку" },
    descriptions: { everywhere: "Самый простой Apple-клиент; профиль обновляется вручную.", incy: "Бесплатный Apple-клиент с обновляемой подпиской.", stash: "Точное автоматическое обновление маршрутов на iPhone и iPad.", "clash-verge": "Популярный настольный клиент Mihomo.", "clash-party": "Компактный Mihomo-клиент для компьютера.", "clash-meta": "Проверенный Mihomo-клиент для Android.", flclash: "Лёгкий кроссплатформенный Mihomo-клиент.", happ: "Простой бесплатный кроссплатформенный клиент.", "sing-box-android": "Официальный клиент sing-box для Android.", "sing-box-apple": "Официальный клиент sing-box для устройств Apple.", "sing-box-desktop": "Официальный профиль sing-box для компьютера.", v2rayn: "Полная обновляемая конфигурация Xray.", v2rayng: "Полная обновляемая конфигурация Xray для Android." },
    advancedNames: { "vless-links": "Подписка для INCY", "mihomo-yaml": "Mihomo YAML", "sing-box-json": "sing-box JSON", "xray-json": "Xray JSON" }, advancedDescriptions: { "vless-links": "Маршруты загружаются отдельно. Импорт отдельной ссылки подключения их не переносит.", "mihomo-yaml": "Полный профиль Mihomo для ручного импорта.", "sing-box-json": "Полный профиль sing-box для ручного импорта.", "xray-json": "Полная конфигурация Xray для ручного импорта." },
  },
  en: {
    methods: "Connection methods",
    requirements: "App / bundled engine versions",
    routing: {"full": {"label": "Outpost routes · full support", "detail": "All rules and their order are preserved."}, "limited": {"label": "Outpost routes · limited support", "detail": "Rules are grouped by action; their order may change."}, "none": {"label": "No Outpost routes", "detail": "The file contains connection settings only."}},

    unavailable: "Choose a compatible profile under “For advanced users”. If none are available, contact the server owner.",
    modernText: "Import this profile manually into a client with the listed capabilities.",
    title: "Connection setup", heading: "Connect your device", subtitle: "Choose an app for your device. Each profile shows its available connection methods and support for Outpost routes.", auto: "Auto", appsFor: "Apps for", operatingSystem: "Operating system", more: "More apps", advanced: "For advanced users", advancedText: "Raw profiles for manual import. Individual URIs do not contain Outpost routes.", add: "Open in app", copy: "Copy profile", copyLink: "Copy link", openQr: "Open QR code", install: "Install", automatic: "Routes update automatically", manual: "Routes update manually", client: { opening: "Opening the app…", copied: "Link copied—paste it into the app", copyFailed: "Could not copy the link" },
    descriptions: { everywhere: "The simplest Apple client; refresh the profile manually.", incy: "A free Apple client with an updating subscription.", stash: "Exact automatic route updates on iPhone and iPad.", "clash-verge": "A popular Mihomo desktop client.", "clash-party": "A compact Mihomo desktop client.", "clash-meta": "A proven Mihomo client for Android.", flclash: "A lightweight cross-platform Mihomo client.", happ: "A simple free cross-platform client.", "sing-box-android": "The official sing-box client for Android.", "sing-box-apple": "The official sing-box client for Apple devices.", "sing-box-desktop": "The official sing-box desktop profile.", v2rayn: "A complete updating Xray configuration.", v2rayng: "A complete updating Xray configuration for Android." },
    advancedNames: { "vless-links": "INCY subscription", "mihomo-yaml": "Mihomo YAML", "sing-box-json": "sing-box JSON", "xray-json": "Xray JSON" }, advancedDescriptions: { "vless-links": "Routes load separately. Importing an individual connection link does not include them.", "mihomo-yaml": "Complete Mihomo profile for manual import.", "sing-box-json": "Complete sing-box profile for manual import.", "xray-json": "Complete Xray configuration for manual import." },
  },
  "zh-CN": {
    methods: "连接方式",
    requirements: "客户端及内核版本",
    routing: {"full": {"label": "完整支持 Outpost 路由", "detail": "保留所有规则及其顺序。"}, "limited": {"label": "有限支持 Outpost 路由", "detail": "规则按操作分组，顺序可能改变。"}, "none": {"label": "不包含 Outpost 路由", "detail": "文件只包含连接设置。"}},

    unavailable: "请在“高级选项”中选择兼容配置。如无可用配置，请联系服务器所有者。",
    modernText: "请手动导入到具有下列功能的客户端。",
    title: "连接设置", heading: "连接您的设备", subtitle: "选择适合您设备的应用。每个配置都会显示可用连接方式及其对 Outpost 路由的支持情况。", auto: "自动", appsFor: "适用于", operatingSystem: "操作系统", more: "更多应用", advanced: "高级选项", advancedText: "用于手动导入的原始配置。单独 URI 不包含 Outpost 路由。", add: "在应用中打开", copy: "复制配置", copyLink: "复制链接", openQr: "打开 QR 码", install: "安装", automatic: "路由自动更新", manual: "路由需手动更新", client: { opening: "正在打开应用…", copied: "链接已复制，请粘贴到应用中", copyFailed: "无法复制链接" },
    descriptions: { everywhere: "最简单的 Apple 客户端；配置需手动更新。", incy: "支持更新订阅的免费 Apple 客户端。", stash: "在 iPhone 和 iPad 上精确自动更新路由。", "clash-verge": "流行的 Mihomo 桌面客户端。", "clash-party": "轻巧的 Mihomo 桌面客户端。", "clash-meta": "经过验证的 Android Mihomo 客户端。", flclash: "轻量级跨平台 Mihomo 客户端。", happ: "简单免费的跨平台客户端。", "sing-box-android": "官方 sing-box Android 客户端。", "sing-box-apple": "官方 sing-box macOS 客户端。", "sing-box-desktop": "官方 sing-box 桌面配置。", v2rayn: "完整且可更新的 Xray 配置。", v2rayng: "适用于 Android 的完整可更新 Xray 配置。" },
    advancedNames: { "vless-links": "INCY 订阅", "mihomo-yaml": "Mihomo YAML", "sing-box-json": "sing-box JSON", "xray-json": "Xray JSON" }, advancedDescriptions: { "vless-links": "路由单独加载。导入单个连接链接不包含路由。", "mihomo-yaml": "用于手动导入的完整 Mihomo 配置。", "sing-box-json": "用于手动导入的完整 sing-box 配置。", "xray-json": "用于手动导入的完整 Xray 配置。" },
  },
  fa: {
    methods: "روش‌های اتصال",
    requirements: "نسخهٔ برنامه و موتور داخلی",
    routing: {"full": {"label": "پشتیبانی کامل از مسیرهای Outpost", "detail": "همهٔ قوانین و ترتیب آن‌ها حفظ می‌شود."}, "limited": {"label": "پشتیبانی محدود از مسیرهای Outpost", "detail": "قوانین بر اساس عمل گروه‌بندی می‌شوند و ترتیب ممکن است تغییر کند."}, "none": {"label": "بدون مسیرهای Outpost", "detail": "فایل فقط تنظیمات اتصال را دارد."}},

    unavailable: "یک پروفایل سازگار از «برای کاربران حرفه‌ای» انتخاب کنید. اگر پروفایلی موجود نیست، با مالک سرور تماس بگیرید.",
    modernText: "این پروفایل را در کلاینتی با قابلیت‌های مشخص‌شده به‌صورت دستی وارد کنید.",
    title: "راه‌اندازی اتصال", heading: "دستگاه خود را متصل کنید", subtitle: "برنامه‌ای برای دستگاه خود انتخاب کنید. روش‌های اتصال موجود و پشتیبانی از مسیرهای Outpost برای هر پروفایل نمایش داده می‌شود.", auto: "خودکار", appsFor: "برنامه‌ها برای", operatingSystem: "سیستم‌عامل", more: "برنامه‌های بیشتر", advanced: "برای کاربران حرفه‌ای", advancedText: "پروفایل‌های خام برای ورود دستی. URIهای جداگانه شامل مسیرهای Outpost نیستند.", add: "باز کردن در برنامه", copy: "کپی پروفایل", copyLink: "کپی پیوند", openQr: "باز کردن کد QR", install: "نصب", automatic: "مسیرها خودکار به‌روزرسانی می‌شوند", manual: "مسیرها دستی به‌روزرسانی می‌شوند", client: { opening: "در حال باز کردن برنامه…", copied: "پیوند کپی شد؛ آن را در برنامه جای‌گذاری کنید", copyFailed: "کپی پیوند انجام نشد" },
    descriptions: { everywhere: "ساده‌ترین کلاینت Apple؛ پروفایل دستی به‌روزرسانی می‌شود.", incy: "کلاینت رایگان Apple با اشتراک قابل به‌روزرسانی.", stash: "به‌روزرسانی خودکار و دقیق مسیرها در iPhone و iPad.", "clash-verge": "کلاینت محبوب دسکتاپ Mihomo.", "clash-party": "کلاینت جمع‌وجور دسکتاپ Mihomo.", "clash-meta": "کلاینت آزموده‌شدهٔ Mihomo برای Android.", flclash: "کلاینت سبک و چندسکویی Mihomo.", happ: "کلاینت ساده، رایگان و چندسکویی.", "sing-box-android": "کلاینت رسمی sing-box برای Android.", "sing-box-apple": "کلاینت رسمی sing-box برای دستگاه‌های Apple.", "sing-box-desktop": "پروفایل رسمی دسکتاپ sing-box.", v2rayn: "پیکربندی کامل و قابل به‌روزرسانی Xray.", v2rayng: "پیکربندی کامل و قابل به‌روزرسانی Xray برای Android." },
    advancedNames: { "vless-links": "اشتراک INCY", "mihomo-yaml": "Mihomo YAML", "sing-box-json": "sing-box JSON", "xray-json": "Xray JSON" }, advancedDescriptions: { "vless-links": "مسیرها جداگانه بارگذاری می‌شوند. وارد کردن پیوند اتصال تکی شامل مسیرها نمی‌شود.", "mihomo-yaml": "پروفایل کامل Mihomo برای ورود دستی.", "sing-box-json": "پروفایل کامل sing-box برای ورود دستی.", "xray-json": "پیکربندی کامل Xray برای ورود دستی." },
  },
} satisfies Record<Locale, { unavailable: string; modernText: string; methods: string; requirements: string; routing: Record<"full" | "limited" | "none", {label: string; detail: string}>; title: string; heading: string; subtitle: string; auto: string; appsFor: string; operatingSystem: string; more: string; advanced: string; advancedText: string; add: string; copy: string; copyLink: string; openQr: string; install: string; automatic: string; manual: string; client: Record<string, string>; descriptions: Record<string, string>; advancedNames: Record<string, string>; advancedDescriptions: Record<string, string> }>;
