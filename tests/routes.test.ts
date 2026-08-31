import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { OutpostDatabase } from "../src/server/db/database";
import { RouteService } from "../src/server/services/routes";
import { JournalService } from "../src/server/services/journal";
import { database } from "./helpers";

describe("route revisions", () => {
  let fixture: ReturnType<typeof database>;
  let routes: RouteService;

  beforeEach(() => {
    fixture = database();
    routes = new RouteService(fixture.db);
  });
  afterEach(() => fixture.close());

  test("starts with a neutral system policy", () => {
    expect(routes.draft().map((rule) => [rule.value, rule.action, rule.source])).toEqual([
      ["10.0.0.0/8", "DIRECT", "system"],
      ["172.16.0.0/12", "DIRECT", "system"],
      ["192.168.0.0/16", "DIRECT", "system"],
      ["*", "PROXY", "system"],
    ]);
    expect(routes.state()).toMatchObject({ activeVersion: 1, dirty: false });
    expect(routes.revisions()).toEqual([expect.objectContaining({ version: 1, note: "Базовые правила", actor: "system" })]);
  });

  test("promotes untouched defaults left unpublished by an earlier installation", () => {
    fixture.db.raw.exec("DELETE FROM route_revisions");
    fixture.db.setSetting("active_route_version", 0);
    const reopened = new OutpostDatabase(join(fixture.directory, "test.sqlite"));
    try {
      routes = new RouteService(reopened);
      expect(routes.state()).toMatchObject({ activeVersion: 1, dirty: false });
      expect(routes.revisions()).toHaveLength(1);
    } finally {
      reopened.close();
    }
  });

  test("does not publish an edited legacy draft automatically", () => {
    fixture.db.raw.exec("DELETE FROM route_revisions");
    fixture.db.setSetting("active_route_version", 0);
    fixture.db.raw.query("UPDATE route_drafts SET action = 'BLOCK' WHERE value = '*'").run();
    const reopened = new OutpostDatabase(join(fixture.directory, "test.sqlite"));
    try {
      routes = new RouteService(reopened);
      expect(routes.state()).toMatchObject({ activeVersion: 0, dirty: true });
      expect(routes.revisions()).toHaveLength(0);
    } finally {
      reopened.close();
    }
  });

  test("keeps catch-all last and publishes immutable revisions", () => {
    const first = routes.publish("defaults", "test");
    routes.add({ action: "DIRECT", matcher: "DOMAIN", value: "example.com" }, "test");
    const draft = routes.draft();
    expect(draft.slice(0, 4).map((rule) => rule.value)).toEqual([
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "example.com",
    ]);
    expect(draft.at(-1)?.value).toBe("*");
    expect(routes.state().dirty).toBeTrue();
    const second = routes.publish("exception", "test");
    expect(second.activeVersion).toBe(first.activeVersion + 1);
    expect(routes.revisions()).toHaveLength(3);
    expect(() => routes.add({ action: "DIRECT", matcher: "SUFFIX", value: "*" }, "test")).toThrow("уже существует");
    expect(() => routes.update(draft.find((rule) => rule.value === "example.com")!.id, { matcher: "SUFFIX", value: "*" })).toThrow("уже существует");
  });

  test("accepts a top-level domain as a suffix and stores it canonically", () => {
    routes.add({ action: "DIRECT", matcher: "SUFFIX", value: ".RU" }, "test");
    expect(routes.draft().find((rule) => rule.matcher === "SUFFIX" && rule.value !== "*")).toMatchObject({
      action: "DIRECT",
      value: "ru",
    });
    expect(() => routes.publish("ru direct", "test")).not.toThrow();
  });

  test("accepts individual IP addresses and stores host prefixes", () => {
    routes.add({ action: "DIRECT", matcher: "IP_CIDR", value: "192.0.2.17" }, "test");
    routes.add({ action: "DIRECT", matcher: "IP_CIDR", value: "2001:DB8::17" }, "test");
    expect(routes.draft().filter((rule) => rule.source === "user").map((rule) => rule.value).sort()).toEqual([
      "192.0.2.17/32",
      "2001:db8::17/128",
    ]);
  });

  test("rejects normalized duplicates on create, update and publish", () => {
    routes.add({ action: "DIRECT", matcher: "DOMAIN", value: " Example.COM " }, "test");
    expect(() => routes.add({ action: "BLOCK", matcher: "DOMAIN", value: "example.com" }, "test"))
      .toThrow("таким условием уже существует");

    routes.add({ action: "DIRECT", matcher: "DOMAIN", value: "second.example" }, "test");
    const second = routes.draft().find((rule) => rule.value === "second.example")!;
    expect(() => routes.update(second.id, { value: "EXAMPLE.COM" }, "test"))
      .toThrow("таким условием уже существует");
    expect(routes.draft().find((rule) => rule.id === second.id)?.value).toBe("second.example");

    fixture.db.raw.query("UPDATE route_drafts SET value = 'example.com' WHERE id = ?").run(second.id);
    expect(() => routes.publish("legacy duplicate", "test")).toThrow("таким условием уже существует");
  });

  test("rejects invalid geo rules while saving and in legacy drafts", () => {
    const before = routes.draft();
    expect(() => routes.add({ action: "DIRECT", matcher: "GEOSITE", value: "domain: ru" }, "test"))
      .toThrow("без префикса");
    expect(routes.draft()).toEqual(before);

    fixture.db.raw.query("UPDATE route_drafts SET matcher = 'GEOSITE', value = 'domain: ru' WHERE value = '10.0.0.0/8'").run();
    expect(() => routes.publish("invalid legacy draft", "test")).toThrow("без префикса");
  });

  test("removes an invalid legacy user rule without validating it", () => {
    routes.add({ action: "DIRECT", matcher: "DOMAIN", value: "example.com" }, "test");
    const id = routes.draft().find((rule) => rule.value === "example.com")!.id;
    fixture.db.raw.query("UPDATE route_drafts SET matcher = 'GEOSITE', value = 'domain: ru' WHERE id = ?").run(id);

    expect(() => routes.remove(id, "test")).not.toThrow();
    expect(routes.draft().some((rule) => rule.id === id)).toBeFalse();
  });

  test("rejects malformed domain and CIDR matchers while saving", () => {
    expect(() => routes.add({ action: "DIRECT", matcher: "DOMAIN", value: "*" }, "test"))
      .toThrow("полный домен");
    expect(() => routes.add({ action: "DIRECT", matcher: "IP_CIDR", value: "999.0.0.1/99" }, "test"))
      .toThrow("IP-адрес или CIDR");
  });

  test("checks ruleset availability before persisting a geo rule", () => {
    const guarded = new RouteService(fixture.db, undefined, {
      assert: () => { throw new Error("Такого GeoSite-кода нет"); },
      prepare: () => () => {},
      version: () => null,
    });
    const before = guarded.draft();
    expect(() => guarded.add({ action: "DIRECT", matcher: "GEOSITE", value: "google" }, "test"))
      .toThrow("Такого GeoSite-кода нет");
    expect(guarded.draft()).toEqual(before);
  });

  test("prepares GeoSite rules on publish and activates the cache after the revision", () => {
    const lifecycle: string[] = [];
    const guarded = new RouteService(fixture.db, undefined, {
      assert: () => {},
      prepare: (rules) => {
        lifecycle.push(`prepare:${fixture.db.setting("active_route_version", 0)}:${rules.some((rule) => rule.matcher === "GEOSITE")}`);
        return () => lifecycle.push(`activate:${fixture.db.setting("active_route_version", 0)}`);
      },
      version: () => "v1",
    });

    guarded.add({ action: "DIRECT", matcher: "GEOSITE", value: "google" }, "test");
    expect(lifecycle).toEqual([]);

    guarded.publish("google direct", "test");
    expect(lifecycle).toEqual(["prepare:1:true", "activate:2"]);
  });

  test("does not publish when GeoSite preparation fails", () => {
    const guarded = new RouteService(fixture.db, undefined, {
      assert: () => {},
      prepare: () => { throw new Error("GeoSite cache is unavailable"); },
      version: () => "v1",
    });
    guarded.add({ action: "DIRECT", matcher: "GEOSITE", value: "google" }, "test");
    const before = guarded.state();

    expect(() => guarded.publish("google direct", "test")).toThrow("GeoSite cache is unavailable");
    expect(guarded.state()).toMatchObject({ activeVersion: before.activeVersion, published: before.published });
    expect(guarded.revisions()).toHaveLength(1);
  });

  test("publishes a typed route revision event", () => {
    routes.publish("defaults", "test");
    expect(new JournalService(fixture.db).latest(1)[0]).toMatchObject({
      type: "routes.published",
      category: "routes",
      title: "Опубликована ревизия маршрутов №2",
    });
  });

  test("protects system rules", () => {
    const locked = routes.draft().find((rule) => rule.value === "10.0.0.0/8")!;
    expect(() => routes.remove(locked.id)).toThrow("нельзя удалить");
    expect(() => routes.update(locked.id, { value: "changed.example" })).toThrow("нельзя менять");
    routes.update(locked.id, { action: "PROXY" });
    expect(routes.draft().slice(0, 3).map((rule) => rule.action)).toEqual(["PROXY", "PROXY", "PROXY"]);

    const terminal = routes.draft().at(-1)!;
    routes.update(terminal.id, { action: "DIRECT" });
    expect(routes.draft().at(-1)?.action).toBe("DIRECT");
    expect(() => routes.update(terminal.id, { enabled: false })).toThrow("нельзя менять");
    expect(() => routes.update(terminal.id, { value: "example.com" })).toThrow("нельзя менять");
    expect(() => routes.remove(terminal.id)).toThrow("нельзя удалить");
  });

  test("pins the local-network group first and catch-all last", () => {
    const draft = routes.draft();
    const ids = draft.map((rule) => rule.id);
    expect(() => routes.reorder([ids[1]!, ids[0]!, ids[2]!, ids[3]!], "test")).toThrow("локальная сеть");
    expect(() => routes.reorder([...ids.slice(0, 2), ids[3]!, ids[2]!], "test")).toThrow("всё остальное");
  });

  test("discards draft changes without creating a revision", () => {
    const published = routes.publish("defaults", "test");
    const locked = routes.draft().find((rule) => rule.value === "10.0.0.0/8")!;
    routes.update(locked.id, { action: "PROXY" }, "test");
    routes.add({ action: "BLOCK", matcher: "DOMAIN", value: "example.com" }, "test");
    expect(routes.state().dirty).toBeTrue();

    const restored = routes.discard("test");
    expect(restored.dirty).toBeFalse();
    expect(restored.draft.map((rule) => rule.id)).toEqual(published.published!.rules.map((rule) => rule.id));
    expect(restored.draft.map((rule) => rule.action)).toEqual(published.published!.rules.map((rule) => rule.action));
    expect(routes.revisions()).toHaveLength(2);
  });

});
