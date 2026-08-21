export const locales = ["ru", "en", "zh-CN", "fa"] as const;

export type Locale = typeof locales[number];
export type Messages = Record<string, string>;
export type Params = Record<string, string | number | boolean | null | undefined>;

export const languages: Array<{ id: Locale; label: string; intl: string; direction: "ltr" | "rtl" }> = [
  { id: "ru", label: "Русский", intl: "ru-RU", direction: "ltr" },
  { id: "en", label: "English", intl: "en", direction: "ltr" },
  { id: "zh-CN", label: "简体中文", intl: "zh-CN", direction: "ltr" },
  { id: "fa", label: "فارسی", intl: "fa-IR", direction: "rtl" },
];

export function locale(value?: string | null): Locale | null {
  if (!value) return null;
  const normalized = value.trim().replaceAll("_", "-");
  const lower = normalized.toLowerCase();
  if (lower === "ru" || lower.startsWith("ru-")) return "ru";
  if (lower === "en" || lower.startsWith("en-")) return "en";
  if (lower === "fa" || lower.startsWith("fa-")) return "fa";
  if (lower === "zh" || lower === "zh-cn" || lower === "zh-sg" || lower.startsWith("zh-hans")) return "zh-CN";
  return null;
}

export function resolve(values: Array<string | null | undefined>): Locale {
  for (const value of values) {
    const resolved = locale(value);
    if (resolved) return resolved;
  }
  return "en";
}

export function accept(value?: string | null): Locale {
  const values = (value ?? "")
    .split(",")
    .map((part, index) => {
      const [language, ...parameters] = part.trim().split(";");
      const quality = parameters.map((parameter) => parameter.trim().match(/^q=([01](?:\.\d+)?)$/i)?.[1]).find(Boolean);
      return { language: language ?? "", quality: quality === undefined ? 1 : Number(quality), index };
    })
    .filter((entry) => entry.language && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map((entry) => entry.language);
  return resolve(values);
}

export function metadata(value: Locale) {
  return languages.find((item) => item.id === value) ?? languages[1]!;
}

export function interpolate(message: string, params: Params = {}) {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function translator(catalog: Record<Locale, Messages>, fallback: Locale = "en") {
  return (language: Locale, key: string, params?: Params) => {
    const message = catalog[language][key] ?? catalog[fallback][key] ?? catalog.ru[key] ?? key;
    return interpolate(message, params);
  };
}
