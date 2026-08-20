import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("admin navigation", () => {
  test("contains only current pages and no legacy aliases", async () => {
    const app = await Bun.file(new URL("../src/web/app.imba", import.meta.url)).text();
    const shell = await Bun.file(new URL("../src/web/shell.imba", import.meta.url)).text();
    const store = await Bun.file(new URL("../src/web/store.imba", import.meta.url)).text();
    const dialogs = await Bun.file(new URL("../src/web/dialogs.imba", import.meta.url)).text();
    const avatars = await Bun.file(new URL("../src/web/avatar-picker.imba", import.meta.url)).text();

    expect(store).toContain("['/', '/connections', '/protocols', '/routes', '/journal', '/access', '/settings', '/login', '/setup', '/onboarding']");
    for (const legacy of ["path.startsWith('/traffic')", "path.startsWith('/system')", "path.startsWith('/profile')"]) {
      expect(store).not.toContain(legacy);
    }
    expect(store).not.toContain("Outpost · Трафик");
    expect(store).not.toContain("Outpost · Система");
    expect(shell).not.toContain("outpost-traffic");
    expect(shell).not.toContain("outpost-system store");
    expect(shell).toContain("outpost-connections");
    expect(shell).toContain("outpost-protocols");
    expect(app).not.toContain("./traffic.imba");
    expect(app).not.toContain("./system.imba");
    for (const action of ["Изменить аватар", "Свернуть", "Выберите аватар"]) {
      expect(dialogs).toContain(action);
    }
    expect(dialogs).not.toContain("Известный человек");
    expect(avatars.indexOf("avatar-person")).toBeLessThan(avatars.indexOf("avatar-group"));
    expect(avatars).toContain("Фильтры аватаров");
    expect(dialogs).not.toContain("connections.note");
    expect(existsSync(fileURLToPath(new URL("../src/web/traffic.imba", import.meta.url)))).toBeFalse();
    expect(existsSync(fileURLToPath(new URL("../src/web/system.imba", import.meta.url)))).toBeFalse();
    expect(existsSync(fileURLToPath(new URL("../src/web/people.imba", import.meta.url)))).toBeFalse();
    expect(existsSync(fileURLToPath(new URL("../src/web/proxies.imba", import.meta.url)))).toBeFalse();
  });
});
