import type {Locale} from "./i18n";
import {escapeHtml as escape} from "./html";

export type ClientCompatibility = {
  transports: readonly string[];
  protocolRequirements: readonly {name: string; requirement: string}[];
  routing: {support: string; label: string; detail: string};
  updateMode?: "automatic" | "manual";
};

const copy = {
  ru: {methods: "Способы подключения", automatic: "Обновляются автоматически", manual: "Обновляются вручную"},
  en: {methods: "Connection methods", automatic: "Update automatically", manual: "Update manually"},
  "zh-CN": {methods: "连接方式", automatic: "自动更新", manual: "需手动更新"},
  fa: {methods: "روش‌های اتصال", automatic: "خودکار به‌روزرسانی می‌شوند", manual: "دستی به‌روزرسانی می‌شوند"},
} satisfies Record<Locale, {methods: string; automatic: string; manual: string}>;

export function renderCompatibility(profile: ClientCompatibility, language: Locale) {
  const labels = copy[language];
  const {routing, updateMode} = profile;
  const methods = profile.transports.map((name) => {
    const version = profile.protocolRequirements.find((item) => item.name === name);
    return `<li>${version ? hint(escape(name), `${name}: ${version.requirement}`) : escape(name)}</li>`;
  }).join("");
  const routeHint = routing.support === "full" ? "" : hint('<i class="ph ph-question" aria-hidden="true"></i>', routing.detail);
  const update = updateMode ? `<p class="route-update route-update--${updateMode}"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i><span>${labels[updateMode]}</span></p>` : "";
  return `<div class="client-compatibility"><div class="methods"><span class="fact-label">${labels.methods}</span><ul class="transports">${methods}</ul></div><div class="client-routes"><div class="route-support route-support--${escape(routing.support)}"><i class="ph ph-path" aria-hidden="true"></i><strong>${escape(routing.label)}</strong>${routeHint}</div>${update}</div></div>`;
}

function hint(content: string, detail: string) {
  return `<span class="client-hint" tabindex="0" aria-label="${escape(detail)}">${content}<span class="client-hint-tip" role="tooltip">${escape(detail)}</span></span>`;
}
