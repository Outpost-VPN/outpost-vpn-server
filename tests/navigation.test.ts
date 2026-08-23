import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("admin navigation", () => {
  test("contains only current pages and no legacy aliases", async () => {
    const app = await Bun.file(new URL("../src/web/app.imba", import.meta.url)).text();
    const auth = await Bun.file(new URL("../src/web/auth.imba", import.meta.url)).text();
    const shell = await Bun.file(new URL("../src/web/shell.imba", import.meta.url)).text();
    const store = await Bun.file(new URL("../src/web/store.imba", import.meta.url)).text();
    const home = await Bun.file(new URL("../src/web/home.imba", import.meta.url)).text();
    const connections = await Bun.file(new URL("../src/web/connections.imba", import.meta.url)).text();
    const routes = await Bun.file(new URL("../src/web/routes.imba", import.meta.url)).text();
    const dialogs = await Bun.file(new URL("../src/web/dialogs.imba", import.meta.url)).text();
    const security = await Bun.file(new URL("../src/web/security.imba", import.meta.url)).text();
    const avatars = await Bun.file(new URL("../src/web/avatar-picker.imba", import.meta.url)).text();

    expect(store).toContain("['/', '/connections', '/protocols', '/routes', '/journal', '/access', '/settings', '/login', '/onboarding']");
    expect(app).not.toContain("path == '/setup'");
    expect(store).not.toContain("'/setup'");
    expect(auth).toContain("window.location.assign(onboarding)");
    expect(auth).toContain("credential.authenticatorAttachment == 'cross-platform'");
    expect(auth).toContain("t('auth.remote_hint')");
    expect(app).toContain("window.location.pathname.startsWith('/admin') and params.get('preview') == 'setup'");
    expect(app).toContain("store.dialog == 'passkey'");
    for (const legacy of ["path.startsWith('/traffic')", "path.startsWith('/system')", "path.startsWith('/profile')"]) {
      expect(store).not.toContain(legacy);
    }
    expect(store).not.toContain("Outpost · Трафик");
    expect(store).not.toContain("Outpost · Система");
    expect(shell).not.toContain("outpost-traffic");
    expect(shell).not.toContain("outpost-system store");
    expect(shell).toContain("outpost-connections");
    expect(shell).toContain("outpost-protocols");
    expect(shell).toContain("overflow-x: hidden");
    expect(shell).toContain("get update? do store.data.system.updates.available");
    expect(shell).toContain('<span.notice aria-hidden="true">');
    expect(app).not.toContain("./traffic.imba");
    expect(app).not.toContain("./system.imba");
    for (const action of ["Изменить аватар", "Свернуть", "Выберите аватар"]) {
      expect(dialogs).toContain(action);
    }
    expect(dialogs).not.toContain("Известный человек");
    expect(avatars.indexOf("avatar-person")).toBeLessThan(avatars.indexOf("avatar-group"));
    expect(avatars).toContain("Фильтры аватаров");
    expect(routes).toContain("@click.stop=routes.drop(rule.id)");
    expect(routes).toContain("def reset");
    expect(routes).toContain("removing = new Set");
    expect(routes).toContain("disabled=busy @click.stop=routes.drop(rule.id)");
    expect(routes).not.toContain("remove = null");
    expect(routes).not.toContain("remove=remove update=update");
    expect(home).toContain('Math.max(0, Math.min(100, usage(connection) / maximum * 100))');
    expect(home).toContain('<div.bar><span [w:{scale(connection)}%]>');
    expect(home).not.toContain('style="width:{fmt.percent');
    expect(home).toContain("<span> t('Активность')");
    expect(home).toContain('<span.activity .online=fmt.connectionOnline(connection)');
    expect(home).not.toContain("<span> t('Последняя активность')");
    expect(home).not.toContain("<span> t('Статус')");
    expect(connections).toContain('<outpost-icon name="dots-three">');
    expect(connections).toContain('"/api/v1/connections/{connection.id}/suspend"');
    expect(connections).toContain('"/api/v1/connections/{connection.id}/resume"');
    expect(connections).toContain('disabled=!!connection.suspended_at @click.stop=(do use(connection))');
    expect(connections).toContain("t('connection.edit')");
    expect(connections).toContain("t('connection.delete')");
    expect(dialogs).toContain("t('connection.delete_title')");
    expect(dialogs).not.toContain("connections.note");
    expect(security).toContain("t('access.methods.title')");
    expect(security).toContain("authenticatorAttachment: 'platform'");
    expect(security).toContain("t('passkey.add.warning')");
    expect(existsSync(fileURLToPath(new URL("../src/web/traffic.imba", import.meta.url)))).toBeFalse();
    expect(existsSync(fileURLToPath(new URL("../src/web/system.imba", import.meta.url)))).toBeFalse();
    expect(existsSync(fileURLToPath(new URL("../src/web/people.imba", import.meta.url)))).toBeFalse();
    expect(existsSync(fileURLToPath(new URL("../src/web/proxies.imba", import.meta.url)))).toBeFalse();
  });

  test("refreshes after every SSE reconnect without blocking the 30 second polling fallback", async () => {
    const app = await Bun.file(new URL("../src/web/app.imba", import.meta.url)).text();
    const store = await Bun.file(new URL("../src/web/store.imba", import.meta.url)).text();
    const shell = await Bun.file(new URL("../src/web/shell.imba", import.meta.url)).text();
    const journal = await Bun.file(new URL("../src/web/journal.imba", import.meta.url)).text();

    expect(store).toContain("loading = initial");
    expect(store).toContain("while pending");
    expect(store).toContain("load! if pending");
    expect(store).toContain("new window.EventSource('/api/v1/dashboard/events')");
    expect(store).toContain("\t\tsource.addEventListener 'ready', do self.load!");
    expect(store).toContain("window.setInterval(tick, 30000)");
    expect(store).toContain("window.document.hidden");
    expect(store).toContain("stale = issue.message");
    expect(store).toContain("self.expire! if response.status == 401");
    expect(store).toContain("return payload.message if payload and payload.message");
    expect(store).toContain("changed! if refresh");
    expect(store).toContain("const result = await api(method, url, body)\n\t\t\tawait load!\n\t\t\treturn result");
    expect(app).toContain("store.start!");
    expect(shell).toContain("revision=store.data.revision");
    expect(journal).toContain("@observable revision = 0");
    expect(journal).toContain("@autorun def follow");
    expect(journal).toContain("return if current == seen");
  });

  test("keeps application update progress visible across page and control-plane reloads", async () => {
    const store = await Bun.file(new URL("../src/web/store.imba", import.meta.url)).text();
    const settings = await Bun.file(new URL("../src/web/settings.imba", import.meta.url)).text();
    const dialogs = await Bun.file(new URL("../src/web/dialogs.imba", import.meta.url)).text();

    expect(store).toContain("item.kind == 'update.apply'");
    expect(store).toContain("data.system.updates.status == 'preparing'");
    expect(store).toContain("window.setTimeout(tick, 1000)");
    expect(settings).toContain("get applying?");
    expect(settings).toContain("operation.status == 'failed'");
    expect(settings).toContain("settings.update.completed");
    expect(settings).toContain("<progress.update-progress aria-label=summary>");
    expect(settings).toContain("<span> t('settings.update.check')");
    expect(settings).toContain('<outpost-icon name="arrows-clockwise" .checking=(busy == \'check\')>');
    expect(settings).toContain(".system-action outpost-icon.checking animation:spin");
    expect(settings).not.toContain("busy == 'check' ? 'spinner-gap' : 'arrows-clockwise'");
    expect(settings).toContain("<button.system-action.install");
    expect(settings).toContain('<span.notice aria-hidden="true">');
    expect(settings).toContain("status: 'failed', ready: false, error: issue.message");
    expect(dialogs).toContain("store.hold = true");
    expect(dialogs).toContain("item.id == operation.id");
    expect(dialogs).toContain('<progress value=progress max="100" aria-label=stage>');
    expect(dialogs).toContain("stage = t(current.message) if current.message");
    expect(dialogs).toContain("window.location.reload!");
  });
});
