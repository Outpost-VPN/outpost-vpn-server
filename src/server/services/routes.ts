import { z } from "zod";
import { isIP } from "node:net";
import type { OutpostDatabase } from "../db/database";
import { now } from "../db/database";
import type { RouteRule } from "../models";
import { ServiceError } from "./connections";
import { JournalService } from "./journal";

type ValidatableRoute = Pick<RouteRule, "matcher" | "value" | "enabled">;

type RuleSetCatalog = {
  assert(rules: ValidatableRoute[]): void;
  version(rules: RouteRule[]): string | null;
};

const routeInput = z.object({
  action: z.enum(["DIRECT", "PROXY", "BLOCK"]),
  matcher: z.enum(["DOMAIN", "SUFFIX", "IP_CIDR", "GEOSITE", "GEOIP"]),
  value: z.string().trim().min(1).max(255),
  enabled: z.boolean().default(true),
});
const routeUpdate = routeInput.partial().extend({ enabled: z.boolean().optional() });
const localNetworks = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
const dnsLabel = String.raw`[\p{L}0-9](?:[\p{L}0-9-]{0,61}[\p{L}0-9])?`;
const domainPattern = new RegExp(`^${dnsLabel}(?:\\.${dnsLabel})+$`, "u");
const suffixPattern = new RegExp(`^${dnsLabel}(?:\\.${dnsLabel})*$`, "u");

export class RouteService {
  private journal: JournalService;

  constructor(private db: OutpostDatabase, journal?: JournalService, private rulesets?: RuleSetCatalog) {
    this.journal = journal ?? new JournalService(db);
  }

  state() {
    const draft = this.draft();
    const version = this.db.setting("active_route_version", 0);
    const published = version > 0 ? this.revision(version) : null;
    return {
      draft,
      published,
      activeVersion: version,
      dirty: published ? JSON.stringify(this.normalize(draft)) !== JSON.stringify(this.normalize(published.rules)) : true,
    };
  }

  draft() {
    return this.db.raw.query<RouteRule, []>("SELECT * FROM route_drafts ORDER BY position").all();
  }

  published() {
    const version = this.db.setting("active_route_version", 0);
    return version > 0 ? this.revision(version).rules : this.draft();
  }

  revisions() {
    return this.db.raw.query<{ id: string; version: number; note: string; created_at: string; actor: string; ruleset_version: string | null }, []>(`
      SELECT id, version, note, created_at, actor, ruleset_version FROM route_revisions ORDER BY version DESC LIMIT 50
    `).all();
  }

  add(input: unknown, actor = "owner") {
    const data = routeInput.parse(input);
    const value = this.validateValue(data.matcher, data.value);
    const candidate = { ...data, value };
    this.rulesets?.assert([candidate]);
    if (this.terminal(candidate)) throw new ServiceError(409, "Последнее правило уже существует");
    if (this.duplicate(candidate)) throw new ServiceError(409, "Правило с таким условием уже существует");
    const current = this.draft();
    const timestamp = now();
    const locals = current.filter((entry) => this.local(entry));
    const others = current.filter((entry) => !this.local(entry));
    const rule: RouteRule = {
      id: crypto.randomUUID(),
      position: locals.length,
      ...candidate,
      source: "user",
      locked: false,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.db.raw.transaction(() => {
      this.db.raw.exec("UPDATE route_drafts SET position = position + 10000");
      this.db.raw.query(`
        INSERT INTO route_drafts (id, position, action, matcher, value, source, locked, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'user', 0, ?, ?, ?)
      `).run(rule.id, current.length + 20000, rule.action, rule.matcher, rule.value, rule.enabled ? 1 : 0, timestamp, timestamp);
      const move = this.db.raw.query("UPDATE route_drafts SET position = ?, updated_at = ? WHERE id = ?");
      [...locals.map((entry) => entry.id), rule.id, ...others.map((entry) => entry.id)]
        .forEach((id, position) => move.run(position, timestamp, id));
    })();
    this.db.audit({ actor, action: "routes.create", resource: "route", resourceId: rule.id, after: rule });
    return this.state();
  }

  update(id: string, input: unknown, actor = "owner") {
    const before = this.rule(id);
    const data = routeUpdate.parse(input);
    const structural = data.matcher !== undefined || data.value !== undefined || data.enabled !== undefined;
    if (before.locked && structural) {
      throw new ServiceError(409, "Защищённое системное правило нельзя менять");
    }
    if (this.local(before) && data.action !== undefined) {
      return this.updateLocal(data.action, actor);
    }
    const matcher = data.matcher ?? before.matcher;
    const value = this.validateValue(matcher, data.value ?? before.value);
    if (!this.terminal(before) && this.terminal({ matcher, value })) {
      throw new ServiceError(409, "Последнее правило уже существует");
    }
    const identityChanged = matcher !== before.matcher || value !== this.normalizeValue(before.matcher, before.value);
    if (identityChanged && this.duplicate({ matcher, value }, id)) {
      throw new ServiceError(409, "Правило с таким условием уже существует");
    }
    const next = {
      action: data.action ?? before.action,
      matcher,
      value,
      enabled: data.enabled ?? Boolean(before.enabled),
      updated_at: now(),
    };
    this.rulesets?.assert([next]);
    this.db.raw.query(`
      UPDATE route_drafts SET action = ?, matcher = ?, value = ?, enabled = ?, updated_at = ? WHERE id = ?
    `).run(next.action, next.matcher, next.value, next.enabled ? 1 : 0, next.updated_at, id);
    this.db.audit({ actor, action: "routes.update", resource: "route", resourceId: id, before, after: next });
    return this.state();
  }

  remove(id: string, actor = "owner") {
    const before = this.rule(id);
    if (before.locked) throw new ServiceError(409, "Защищённое системное правило нельзя удалить");
    this.db.raw.transaction(() => {
      this.db.raw.query("DELETE FROM route_drafts WHERE id = ?").run(id);
      this.reindex();
    })();
    this.db.audit({ actor, action: "routes.delete", resource: "route", resourceId: id, before });
    return this.state();
  }

  reorder(ids: string[], actor = "owner") {
    const current = this.draft();
    const expected = new Set(current.map((rule) => rule.id));
    if (ids.length !== current.length || ids.some((id) => !expected.has(id))) {
      throw new ServiceError(400, "Список правил для сортировки неполон");
    }
    const catchAll = current.find((rule) => rule.matcher === "SUFFIX" && rule.value === "*");
    if (catchAll && ids.at(-1) !== catchAll.id) throw new ServiceError(409, "Правило «всё остальное» должно быть последним");
    const locals = localNetworks
      .map((value) => current.find((rule) => this.local(rule) && rule.value === value))
      .filter((rule): rule is RouteRule => Boolean(rule));
    if (locals.some((rule, index) => ids[index] !== rule.id)) {
      throw new ServiceError(409, "Правило «локальная сеть» должно быть первым");
    }
    this.db.raw.transaction(() => {
      this.db.raw.exec("UPDATE route_drafts SET position = position + 10000");
      const update = this.db.raw.query("UPDATE route_drafts SET position = ?, updated_at = ? WHERE id = ?");
      ids.forEach((id, position) => update.run(position, now(), id));
    })();
    this.db.audit({ actor, action: "routes.reorder", resource: "routes", after: ids });
    return this.state();
  }

  publish(
    note = "",
    actor = "owner",
    eventType: "routes.published" | "routes.rolled_back" = "routes.published",
    eventData: Record<string, unknown> = {},
    replacement?: RouteRule[],
  ) {
    const rules = replacement ?? this.draft();
    if (rules.length === 0) throw new ServiceError(409, "Нельзя опубликовать пустой набор маршрутов");
    rules.forEach((rule) => this.validateValue(rule.matcher, rule.value));
    this.assertUnique(rules);
    this.rulesets?.assert(rules);
    const rulesetVersion = this.rulesets?.version(rules) ?? null;
    const version = (this.db.raw.query<{ version: number }, []>("SELECT MAX(version) AS version FROM route_revisions").get()?.version ?? 0) + 1;
    const id = crypto.randomUUID();
    this.journal.change(
      eventType,
      () => {
        if (replacement) this.writeDraft(replacement);
        this.db.raw.query(`
          INSERT INTO route_revisions (id, version, rules_json, note, created_at, actor, ruleset_version)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, version, JSON.stringify(rules), note.trim(), now(), actor, rulesetVersion);
        this.db.setSetting("active_route_version", version);
        return { id, version };
      },
      () => ({
        actor,
        action: eventType === "routes.rolled_back" ? "routes.rollback" : "routes.publish",
        resource: "route_revision",
        resourceId: id,
        after: { version, rules, note: note.trim(), rulesetVersion },
      }),
      () => ({
        actor,
        subjectType: "route_revision",
        subjectId: id,
        data: { version, newVersion: version, rulesCount: rules.length, rulesetVersion, note: note.trim(), ...eventData },
      }),
    );
    return this.state();
  }

  discard(actor = "owner") {
    const version = this.db.setting("active_route_version", 0);
    if (version <= 0) throw new ServiceError(409, "Пока нет опубликованных правил");
    const before = this.draft();
    const target = this.revision(version);
    this.replaceDraft(target.rules, true);
    this.db.audit({ actor, action: "routes.discard", resource: "routes", before, after: target.rules });
    return this.state();
  }

  rollback(version: number, actor = "owner") {
    const fromVersion = this.db.setting("active_route_version", 0);
    const target = this.revision(version);
    return this.publish(
      `Откат к ревизии №${version}`,
      actor,
      "routes.rolled_back",
      { fromVersion, targetVersion: version },
      target.rules,
    );
  }

  preview() {
    const state = this.state();
    return {
      activeVersion: state.activeVersion,
      dirty: state.dirty,
      before: state.published?.rules ?? [],
      after: state.draft,
    };
  }

  private revision(version: number) {
    const row = this.db.raw.query<{ id: string; version: number; rules_json: string; note: string; created_at: string; actor: string; ruleset_version: string | null }, number>(
      "SELECT * FROM route_revisions WHERE version = ?",
    ).get(version);
    if (!row) throw new ServiceError(404, "Ревизия маршрутов не найдена");
    return { ...row, rules: JSON.parse(row.rules_json) as RouteRule[] };
  }

  private rule(id: string) {
    const rule = this.db.raw.query<RouteRule, string>("SELECT * FROM route_drafts WHERE id = ?").get(id);
    if (!rule) throw new ServiceError(404, "Правило не найдено");
    return rule;
  }

  private updateLocal(action: RouteRule["action"], actor: string) {
    const before = this.draft().filter((rule) => this.local(rule));
    const timestamp = now();
    this.db.raw.transaction(() => {
      const update = this.db.raw.query("UPDATE route_drafts SET action = ?, updated_at = ? WHERE id = ?");
      before.forEach((rule) => update.run(action, timestamp, rule.id));
    })();
    this.db.audit({
      actor,
      action: "routes.update",
      resource: "route_group",
      resourceId: "local-network",
      before,
      after: before.map((rule) => ({ ...rule, action, updated_at: timestamp })),
    });
    return this.state();
  }

  private replaceDraft(rules: RouteRule[], preserve = false) {
    this.db.raw.transaction(() => {
      this.writeDraft(rules, preserve);
    })();
  }

  private writeDraft(rules: RouteRule[], preserve = false) {
    this.db.raw.exec("DELETE FROM route_drafts");
    const insert = this.db.raw.query(`
      INSERT INTO route_drafts (id, position, action, matcher, value, source, locked, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rules.forEach((rule, position) => insert.run(
      preserve ? rule.id : crypto.randomUUID(), position, rule.action, rule.matcher, rule.value, rule.source,
      rule.locked ? 1 : 0, rule.enabled ? 1 : 0, now(), now(),
    ));
  }

  private reindex() {
    const rules = this.draft();
    this.db.raw.exec("UPDATE route_drafts SET position = position + 10000");
    const update = this.db.raw.query("UPDATE route_drafts SET position = ? WHERE id = ?");
    rules.forEach((rule, position) => update.run(position, rule.id));
  }

  private terminal(rule: Pick<RouteRule, "matcher" | "value">) {
    return rule.matcher === "SUFFIX" && rule.value === "*";
  }

  private duplicate(rule: Pick<RouteRule, "matcher" | "value">, except?: string) {
    const identity = this.identity(rule);
    return this.draft().some((entry) => entry.id !== except && this.identity(entry) === identity);
  }

  private assertUnique(rules: Array<Pick<RouteRule, "matcher" | "value">>) {
    const identities = new Set<string>();
    for (const rule of rules) {
      const identity = this.identity(rule);
      if (identities.has(identity)) throw new ServiceError(409, "Правило с таким условием уже существует");
      identities.add(identity);
    }
  }

  private identity(rule: Pick<RouteRule, "matcher" | "value">) {
    return `${rule.matcher}\u0000${this.normalizeValue(rule.matcher, rule.value)}`;
  }

  private local(rule: Pick<RouteRule, "source" | "matcher" | "value">) {
    return rule.source === "system" && rule.matcher === "IP_CIDR" && localNetworks.includes(rule.value);
  }

  private validateValue(matcher: RouteRule["matcher"], raw: string) {
    const value = this.normalizeValue(matcher, raw);
    if (matcher === "IP_CIDR") {
      const addressFamily = isIP(value);
      if (addressFamily) return `${value}/${addressFamily === 4 ? 32 : 128}`;
      const [address, rawPrefix, extra] = value.split("/");
      const family = isIP(address ?? "");
      const prefix = Number(rawPrefix);
      if (extra !== undefined || !family || rawPrefix === undefined || !/^\d{1,3}$/.test(rawPrefix)
        || !Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)) {
        throw new ServiceError(400, "Укажите IP-адрес или CIDR, например 192.0.2.1 или 2001:db8::/32");
      }
    }
    if (matcher === "DOMAIN" && !domainPattern.test(value)) {
      throw new ServiceError(400, "Укажите полный домен, например example.com");
    }
    if (matcher === "SUFFIX" && value !== "*" && !suffixPattern.test(value)) {
      throw new ServiceError(400, "Укажите доменный суффикс, например example.com или ru");
    }
    if ((matcher === "GEOSITE" || matcher === "GEOIP") && !/^[a-z0-9_@.!+-]{1,80}$/.test(value)) {
      throw new ServiceError(400, "Укажите код GeoSite/GeoIP без префикса, например google или ru");
    }
    return value;
  }

  private normalizeValue(matcher: RouteRule["matcher"], raw: string) {
    let value = raw.trim();
    if (matcher === "SUFFIX" && value !== "*") value = value.replace(/^\./, "");
    if (matcher === "DOMAIN" || matcher === "SUFFIX" || matcher === "GEOSITE" || matcher === "GEOIP" || matcher === "IP_CIDR") {
      value = value.toLowerCase();
    }
    return value;
  }

  private normalize(rules: RouteRule[]) {
    return rules.map(({ id: _id, created_at: _created, updated_at: _updated, ...rule }) => ({
      ...rule,
      locked: Boolean(rule.locked),
      enabled: Boolean(rule.enabled),
    }));
  }
}
