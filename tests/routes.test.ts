import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
    expect(routes.revisions()).toHaveLength(2);
    expect(() => routes.add({ action: "DIRECT", matcher: "SUFFIX", value: "*" }, "test")).toThrow("уже существует");
    expect(() => routes.update(draft.find((rule) => rule.value === "example.com")!.id, { matcher: "SUFFIX", value: "*" })).toThrow("уже существует");
  });

  test("publishes a typed route revision event", () => {
    routes.publish("defaults", "test");
    expect(new JournalService(fixture.db).latest(1)[0]).toMatchObject({
      type: "routes.published",
      category: "routes",
      title: "Опубликована ревизия маршрутов №1",
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
    expect(routes.revisions()).toHaveLength(1);
  });

});
