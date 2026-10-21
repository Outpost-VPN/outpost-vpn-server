import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";

const {compile} = require("imba/compiler") as {
  compile(source: string, options: Record<string, string>): {js: string};
};

// Run the actual Imba formatter without loading the browser or avatar picker.
const bundle = await Bun.build({
  entrypoints: [new URL("../src/web/context.imba", import.meta.url).pathname], target: "bun",
  plugins: [{name: "activity-formatter", setup(build) {
    build.onLoad({filter: /\.imba$/}, ({path}) => {
      if (path.endsWith("/i18n.imba")) return {loader: "js", contents: String.raw`
        export const intl = () => 'ru-RU';
        export const t = (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
      `};
      if (path.endsWith("/avatar-picker.imba")) return {loader: "js", contents: "export const avatarUrl = value => value;"};
      return {loader: "js", contents: compile(readFileSync(path, "utf8"), {sourcePath: path, target: "node", platform: "node"}).js};
    });
  }}],
});
if (!bundle.success) throw new Error(bundle.logs.join("\n"));
const {fmt} = await import(`data:text/javascript;base64,${Buffer.from(await bundle.outputs[0]!.text()).toString("base64")}`);

describe("connection activity labels", () => {
  test("distinguishes unmeasured resource values from real zero usage", () => {
    expect(fmt.bytes(null)).toBe("—"); expect(fmt.rate(null)).toBe("—");
    expect(fmt.bytes(0)).toBe("0 Б"); expect(fmt.rate(0)).toBe("0 бит/с");
  });
  test("shows the last activity while the current presence remains unknown", () => {
    const seen = new Date();
    seen.setHours(18, 55, 27, 0);
    const connection = {status: "active", presence: "unknown", last_seen_at: seen.toISOString()};

    expect(fmt.activity(connection)).toBe("Был сегодня, 18:55");
    expect(fmt.connectionPresence(connection)).toBe("Статус неизвестен");
    expect(connection.last_seen_at).toBe(seen.toISOString());
  });

  test("distinguishes unknown activity from a confirmed unused connection", () => {
    expect(fmt.activity({status: "active", presence: "unknown", last_seen_at: null})).toBe("Активность неизвестна");
    expect(fmt.activity({status: "active", presence: "offline", last_seen_at: null})).toBe("Не использовалось");
  });

  test("keeps online, suspended and pending actions ahead of historical activity", () => {
    const connection = {status: "active", presence: "online", last_seen_at: "2026-08-22T14:54:21.995Z"};
    expect(fmt.activity(connection)).toBe("Онлайн");
    expect(fmt.activity({...connection, suspended_at: "2026-10-21T16:00:00Z"})).toBe("connection.suspended");
    for (const [status, label] of [["provisioning", "Готовим подключение"], ["rotating", "Перевыпускаем ссылку"], ["archiving", "Архивируем"]]) {
      expect(fmt.activity({...connection, status, presence: "unknown"})).toBe(label);
    }
  });
});
