import YAML, { isSeq, type Document } from "yaml";

export type EngineName = "hysteria" | "xray";

const hysteriaPresetV1 = `
listen: :443
tls:
  cert: {{OUTPOST_TLS_CERT}}
  key: {{OUTPOST_TLS_KEY}}
auth:
  type: http
  http:
    url: {{OUTPOST_AUTH_URL}}
trafficStats:
  listen: {{OUTPOST_STATS_LISTEN}}
  secret: {{OUTPOST_STATS_SECRET}}
masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com/
    rewriteHost: true
`.trim();

const hysteriaPresetV2 = `
listen: :443
tls:
  cert: {{OUTPOST_TLS_CERT}}
  key: {{OUTPOST_TLS_KEY}}
auth:
  type: http
  http:
    url: {{OUTPOST_AUTH_URL}}
trafficStats:
  listen: {{OUTPOST_STATS_LISTEN}}
  secret: {{OUTPOST_STATS_SECRET}}
acl:
  inline:
    - reject(all, udp/443)
masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com/
    rewriteHost: true
`.trim();

const xrayPresetV1 = JSON.stringify({
  log: { loglevel: "warning" },
  stats: "{{OUTPOST_STATS}}",
  policy: {
    levels: { "0": { statsUserUplink: true, statsUserDownlink: true } },
    system: { statsInboundUplink: true, statsInboundDownlink: true },
  },
  api: "{{OUTPOST_API}}",
  inbounds: [
    {
      tag: "vless-xhttp",
      listen: "127.0.0.1",
      port: 10000,
      protocol: "vless",
      settings: { clients: "{{OUTPOST_XHTTP_USERS}}", decryption: "none" },
      streamSettings: { network: "xhttp", xhttpSettings: { path: "{{OUTPOST_XHTTP_PATH}}", mode: "auto" } },
    },
    {
      tag: "vless-grpc",
      listen: "127.0.0.1",
      port: 10001,
      protocol: "vless",
      settings: { clients: "{{OUTPOST_GRPC_USERS}}", decryption: "none" },
      streamSettings: { network: "grpc", grpcSettings: { serviceName: "{{OUTPOST_GRPC_SERVICE}}" } },
    },
  ],
  outbounds: [{ protocol: "freedom", tag: "direct" }],
}, null, 2);

const xrayPresetV2 = JSON.stringify({
  log: { loglevel: "warning" },
  stats: "{{OUTPOST_STATS}}",
  policy: {
    levels: { "0": { statsUserUplink: true, statsUserDownlink: true } },
    system: { statsInboundUplink: true, statsInboundDownlink: true },
  },
  api: "{{OUTPOST_API}}",
  inbounds: [
    {
      tag: "vless-xhttp",
      listen: "127.0.0.1",
      port: 10000,
      protocol: "vless",
      settings: { clients: "{{OUTPOST_XHTTP_USERS}}", decryption: "none" },
      streamSettings: { network: "xhttp", xhttpSettings: { path: "{{OUTPOST_XHTTP_PATH}}", mode: "auto" } },
    },
    {
      tag: "vless-grpc",
      listen: "127.0.0.1",
      port: 10001,
      protocol: "vless",
      settings: { clients: "{{OUTPOST_GRPC_USERS}}", decryption: "none" },
      streamSettings: { network: "grpc", grpcSettings: { serviceName: "{{OUTPOST_GRPC_SERVICE}}" } },
    },
  ],
  outbounds: [
    { protocol: "freedom", tag: "direct" },
    { protocol: "blackhole", tag: "block" },
  ],
  routing: {
    domainStrategy: "AsIs",
    rules: [{ type: "field", network: "udp", port: 443, outboundTag: "block" }],
  },
}, null, 2);

const presets: Record<EngineName, ReadonlyMap<number, string>> = {
  hysteria: new Map([[1, hysteriaPresetV1], [2, hysteriaPresetV2]]),
  xray: new Map([[1, xrayPresetV1], [2, xrayPresetV2]]),
};

export const currentEnginePresetVersions: Record<EngineName, number> = {
  hysteria: 2,
  xray: 2,
};

export const defaultHysteriaTemplate = hysteriaPresetV2;
export const defaultXrayTemplate = xrayPresetV2;

export interface EnginePresetConflict {
  path: string;
  reason: "both_changed" | "same_array_key_added";
  base: unknown;
  user: unknown;
  preset: unknown;
  missing: { base: boolean; user: boolean; preset: boolean };
}

export interface EnginePresetMerge {
  engine: EngineName;
  fromVersion: number;
  toVersion: number;
  template: string;
  changed: boolean;
  conflicts: EnginePresetConflict[];
  errors: string[];
}

const missing = Symbol("missing");
type MaybeValue = unknown | typeof missing;

export function enginePreset(engine: EngineName, version = currentEnginePresetVersions[engine]) {
  return presets[engine].get(version) ?? null;
}

export function mergeEnginePreset(engine: EngineName, userTemplate: string, fromVersion: number): EnginePresetMerge {
  const toVersion = currentEnginePresetVersions[engine];
  const baseTemplate = enginePreset(engine, fromVersion);
  const nextTemplate = enginePreset(engine, toVersion)!;
  if (!baseTemplate) {
    return {
      engine,
      fromVersion,
      toVersion,
      template: userTemplate,
      changed: false,
      conflicts: [],
      errors: [`Неизвестна базовая версия пресета ${fromVersion}`],
    };
  }
  if (fromVersion === toVersion) {
    return { engine, fromVersion, toVersion, template: userTemplate, changed: false, conflicts: [], errors: [] };
  }
  try {
    const conflicts: EnginePresetConflict[] = [];
    const base = parseEngineTemplate(engine, baseTemplate);
    const user = parseEngineTemplate(engine, userTemplate);
    const preset = parseEngineTemplate(engine, nextTemplate);
    const merged = mergeValue(base, user, preset, "", conflicts);
    const template = stringifyEngineTemplate(engine, merged, userTemplate, user);
    return {
      engine,
      fromVersion,
      toVersion,
      template,
      changed: template !== userTemplate,
      conflicts,
      errors: [],
    };
  } catch (error) {
    return {
      engine,
      fromVersion,
      toVersion,
      template: userTemplate,
      changed: false,
      conflicts: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function parseEngineTemplate(engine: EngineName, template: string): unknown {
  return engine === "xray" ? JSON.parse(template) : YAML.parse(encodeYamlPlaceholders(template));
}

function stringifyEngineTemplate(engine: EngineName, value: unknown, sourceTemplate: string, sourceValue: unknown) {
  if (engine === "xray") return JSON.stringify(value, null, 2);
  const document = YAML.parseDocument(encodeYamlPlaceholders(sourceTemplate));
  if (document.errors.length) throw document.errors[0];
  syncYamlDocument(document, [], sourceValue, value);
  return decodeYamlPlaceholders(String(document)).trim();
}

function syncYamlDocument(document: Document, path: Array<string | number>, before: unknown, after: unknown) {
  if (equal(before, after)) return;
  if (isObject(before) && isObject(after)) {
    for (const key of Object.keys(before)) {
      if (!own(after, key)) document.deleteIn([...path, key]);
    }
    for (const [key, value] of Object.entries(after)) {
      if (!own(before, key)) document.setIn([...path, key], clone(value));
      else syncYamlDocument(document, [...path, key], before[key], value);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    syncYamlArray(document, path, before, after);
    return;
  }
  document.setIn(path, clone(after));
}

function syncYamlArray(document: Document, path: Array<string | number>, before: unknown[], after: unknown[]) {
  const sequence = document.getIn(path, true);
  if (!isSeq(sequence)) {
    document.setIn(path, clone(after));
    return;
  }
  const key = arrayKey(before, after);
  const identity = (value: unknown) => key && isObject(value) ? String(value[key]) : stable(value);
  const current = [...before];
  for (let target = 0; target < after.length; target += 1) {
    const wanted = identity(after[target]);
    const found = current.findIndex((value, index) => index >= target && identity(value) === wanted);
    if (found < 0) {
      sequence.items.splice(target, 0, document.createNode(clone(after[target])));
      current.splice(target, 0, clone(after[target]));
      continue;
    }
    if (found !== target) {
      sequence.items.splice(target, 0, sequence.items.splice(found, 1)[0]!);
      current.splice(target, 0, current.splice(found, 1)[0]);
    }
    syncYamlDocument(document, [...path, target], current[target], after[target]);
    current[target] = clone(after[target]);
  }
  if (current.length > after.length) sequence.items.splice(after.length, current.length - after.length);
}

function mergeValue(
  base: MaybeValue,
  user: MaybeValue,
  preset: MaybeValue,
  path: string,
  conflicts: EnginePresetConflict[],
): MaybeValue {
  if (equal(user, base)) return clone(preset);
  if (equal(preset, base) || equal(user, preset)) return clone(user);

  if (base === missing) {
    if (user === missing) return clone(preset);
    if (preset === missing) return clone(user);
    if (isObject(user) && isObject(preset)) return mergeObject({}, user, preset, path, conflicts);
    if (Array.isArray(user) && Array.isArray(preset)) return mergeArray([], user, preset, path, conflicts);
    return clone(user);
  }

  if (user === missing || preset === missing) {
    conflict(path, base, user, preset, "both_changed", conflicts);
    return clone(user);
  }
  if (isObject(base) && isObject(user) && isObject(preset)) return mergeObject(base, user, preset, path, conflicts);
  if (Array.isArray(base) && Array.isArray(user) && Array.isArray(preset)) return mergeArray(base, user, preset, path, conflicts);

  conflict(path, base, user, preset, "both_changed", conflicts);
  return clone(user);
}

function mergeObject(
  base: Record<string, unknown>,
  user: Record<string, unknown>,
  preset: Record<string, unknown>,
  path: string,
  conflicts: EnginePresetConflict[],
) {
  const result: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(user), ...Object.keys(preset)]);
  for (const key of keys) {
    const value = mergeValue(
      own(base, key) ? base[key] : missing,
      own(user, key) ? user[key] : missing,
      own(preset, key) ? preset[key] : missing,
      childPath(path, key),
      conflicts,
    );
    if (value !== missing) result[key] = value;
  }
  return result;
}

function mergeArray(base: unknown[], user: unknown[], preset: unknown[], path: string, conflicts: EnginePresetConflict[]) {
  const key = arrayKey(base, user, preset);
  if (key) return mergeKeyedArray(base, user, preset, path, key, conflicts);

  const baseKeys = new Set(base.map(stable));
  const presetKeys = new Set(preset.map(stable));
  const result = user.map(clone);
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const value = stable(result[index]);
    if (baseKeys.has(value) && !presetKeys.has(value)) result.splice(index, 1);
  }
  const resultKeys = new Set(result.map(stable));
  for (const value of preset) {
    const key = stable(value);
    if (!baseKeys.has(key) && !resultKeys.has(key)) {
      result.push(clone(value));
      resultKeys.add(key);
    }
  }
  return result;
}

function mergeKeyedArray(
  base: unknown[],
  user: unknown[],
  preset: unknown[],
  path: string,
  key: "tag" | "name" | "id",
  conflicts: EnginePresetConflict[],
) {
  const baseMap = keyed(base, key);
  const userMap = keyed(user, key);
  const presetMap = keyed(preset, key);
  const order = [...userMap.keys(), ...[...presetMap.keys()].filter((id) => !userMap.has(id))];
  const result: unknown[] = [];
  for (const id of order) {
    const baseValue = baseMap.get(id) ?? missing;
    const userValue = userMap.get(id) ?? missing;
    const presetValue = presetMap.get(id) ?? missing;
    const itemPath = `${path || "/"}[${key}=${escapePath(id)}]`;
    if (baseValue === missing && userValue !== missing && presetValue !== missing && !equal(userValue, presetValue)) {
      conflict(itemPath, baseValue, userValue, presetValue, "same_array_key_added", conflicts);
      result.push(clone(userValue));
      continue;
    }
    const value = mergeValue(baseValue, userValue, presetValue, itemPath, conflicts);
    if (value !== missing) result.push(value);
  }
  return result;
}

function arrayKey(...groups: unknown[][]): "tag" | "name" | "id" | null {
  const values = groups.flat();
  if (values.length === 0 || !values.every(isObject)) return null;
  for (const key of ["tag", "name", "id"] as const) {
    if (groups.every((group) => {
      const ids = group.map((value) => isObject(value) ? value[key] : null);
      return ids.every((id) => typeof id === "string") && new Set(ids).size === ids.length;
    })) return key;
  }
  return null;
}

function keyed(values: unknown[], key: "tag" | "name" | "id") {
  return new Map(values.map((value) => [(value as Record<string, unknown>)[key] as string, value]));
}

function conflict(
  path: string,
  base: MaybeValue,
  user: MaybeValue,
  preset: MaybeValue,
  reason: EnginePresetConflict["reason"],
  conflicts: EnginePresetConflict[],
) {
  conflicts.push({
    path: path || "/",
    reason,
    base: exposed(base),
    user: exposed(user),
    preset: exposed(preset),
    missing: { base: base === missing, user: user === missing, preset: preset === missing },
  });
}

function exposed(value: MaybeValue) {
  return value === missing ? null : clone(value);
}

function clone<T>(value: T): T {
  if (value === missing || value === null || typeof value !== "object") return value;
  return structuredClone(value);
}

function equal(left: MaybeValue, right: MaybeValue) {
  if (left === missing || right === missing) return left === right;
  return stable(left) === stable(right);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function own(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function childPath(path: string, key: string) {
  return `${path}/${escapePath(key)}`;
}

function escapePath(value: string) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function encodeYamlPlaceholders(template: string) {
  return template.replace(/{{(OUTPOST_[A-Z0-9_]+)}}/g, "__$1__");
}

function decodeYamlPlaceholders(template: string) {
  return template.replace(/__(OUTPOST_[A-Z0-9_]+)__/g, "{{$1}}");
}
