import { describe, expect, test } from "bun:test";
import { accept, languages, locale, locales, metadata, resolve, translator } from "../src/shared/i18n";
import { errorCode, localize } from "../src/server/i18n";
import { raw } from "../src/web/raw";
import { semantic } from "../src/web/semantic";

describe("locale resolution", () => {
  test("supports the four product locales and simplified Chinese aliases", () => {
    expect(locales).toEqual(["ru", "en", "zh-CN", "fa"]);
    expect(locale("ru-RU")).toBe("ru");
    expect(locale("en-GB")).toBe("en");
    expect(locale("fa-IR")).toBe("fa");
    for (const value of ["zh", "zh-CN", "zh-SG", "zh-Hans"]) expect(locale(value)).toBe("zh-CN");
  });

  test("does not silently map traditional Chinese and falls back to English", () => {
    expect(locale("zh-TW")).toBeNull();
    expect(locale("zh-Hant")).toBeNull();
    expect(resolve(["zh-TW"])).toBe("en");
    expect(accept("zh-Hant-TW, de;q=0.8")).toBe("en");
  });

  test("uses the first supported browser preference", () => {
    expect(resolve(["de-DE", "fa-IR", "ru-RU"])).toBe("fa");
    expect(accept("de-DE, ru-RU;q=0.9, en;q=0.7")).toBe("ru");
    expect(accept("en;q=0.2, fa-IR;q=1, ru;q=0.8")).toBe("fa");
  });

  test("exposes correct Intl locales and direction", () => {
    expect(languages.map((item) => item.id)).toEqual([...locales]);
    expect(metadata("fa")).toMatchObject({ intl: "fa-IR", direction: "rtl" });
    expect(metadata("zh-CN")).toMatchObject({ intl: "zh-CN", direction: "ltr" });
  });
});

describe("message translation", () => {
  test("interpolates parameters and falls back to English", () => {
    const t = translator({
      en: { greeting: "Hello, {name}", onlyEnglish: "English" },
      ru: { greeting: "Привет, {name}" },
      "zh-CN": { greeting: "你好，{name}" },
      fa: { greeting: "سلام، {name}" },
    });
    expect(t("fa", "greeting", { name: "Fedor" })).toBe("سلام، Fedor");
    expect(t("ru", "onlyEnglish")).toBe("English");
  });

  test("keeps all client dictionaries complete with matching placeholders", async () => {
    const sameKeys = (catalog: Record<string, Record<string, string>>) => {
      const expected = Object.keys(catalog.en ?? {}).sort();
      for (const language of ["ru", "zh-CN", "fa"]) {
        if (catalog[language]) expect(Object.keys(catalog[language] ?? {}).sort()).toEqual(expected);
      }
      return expected;
    };
    sameKeys(semantic);
    const rawKeys = sameKeys(raw);
    expect(rawKeys.length).toBeGreaterThan(500);

    const placeholders = (value: string) => [...value.matchAll(/\{[^}]+\}/g)].map((match) => match[0]).sort();
    for (const language of ["ru", "en", "zh-CN", "fa"] as const) {
      for (const key of rawKeys) expect(placeholders(raw[language][key as keyof typeof raw[typeof language]])).toEqual(placeholders(key));
    }

    const sourceKeys = new Set<string>();
    for (const file of ["app", "auth", "avatar-picker", "connections", "context", "dialogs", "home", "journal", "protocols", "routes", "security", "settings", "shell", "store"]) {
      const source = await Bun.file(new URL(`../src/web/${file}.imba`, import.meta.url)).text();
      for (const match of source.matchAll(/'([^'\n]*[А-Яа-яЁё][^'\n]*)'/g)) sourceKeys.add(match[1]!);
    }
    for (const key of sourceKeys) expect(Object.prototype.hasOwnProperty.call(raw.en, key)).toBeTrue();
  });

  test("keeps route validation errors specific in every locale", () => {
    const duplicate = "Правило с таким условием уже существует";
    expect(errorCode(duplicate, 409)).toBe("route.duplicate");
    expect(localize(duplicate, "en")).toBe("A rule with this condition already exists.");
    expect(localize(duplicate, "zh-CN")).toBe("具有此条件的规则已存在。");
    expect(localize(duplicate, "fa")).toBe("قانونی با این شرط از قبل وجود دارد.");
  });
});
