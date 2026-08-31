import type { ClientRouteMatcher } from "../models";

export type GeoSiteDomain = {
  matcher: Extract<ClientRouteMatcher, "DOMAIN" | "SUFFIX" | "DOMAIN_KEYWORD" | "DOMAIN_REGEX">;
  value: string;
};

type ParsedDomain = {
  type: number;
  value: string;
  attributes: string[];
};

const decoder = new TextDecoder("utf-8", { fatal: true });
const maximumDatabaseSize = 64 * 1024 * 1024;

/** Parses the v2fly/domain-list-community dlc.dat protobuf without loading a protobuf runtime. */
export function parseGeoSiteDatabase(bytes: Uint8Array, requestedCodes?: Iterable<string>) {
  validateSize(bytes);
  const requested = requestedCodes ? new Set([...requestedCodes].map(normalizeCode)) : null;
  const reader = new ProtoReader(bytes);
  const sites = new Map<string, GeoSiteDomain[]>();
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1 && wire === 2) {
      const message = reader.bytesField();
      const rawCode = parseSiteCode(new ProtoReader(message));
      if (!rawCode) continue;
      const code = normalizeCode(rawCode);
      if (requested && !relevant(code, requested)) continue;
      const site = parseSite(new ProtoReader(message));
      if (!site.code) continue;
      const all: GeoSiteDomain[] = [];
      const attributes = new Map<string, GeoSiteDomain[]>();
      for (const domain of site.domains) {
        const entries = convertDomain(domain);
        all.push(...entries);
        for (const rawAttribute of domain.attributes) {
          const attribute = normalizeCode(rawAttribute);
          const current = attributes.get(attribute) ?? [];
          current.push(...entries);
          attributes.set(attribute, current);
        }
      }
      sites.set(code, unique(all));
      for (const [attribute, domains] of attributes) sites.set(`${code}@${attribute}`, unique(domains));
    } else {
      reader.skip(wire);
    }
  }
  filterTags(sites);
  mergeChineseCategories(sites);
  for (const [code, domains] of sites) sites.set(code, compile(domains));
  if (requested) {
    for (const code of sites.keys()) if (!requested.has(code)) sites.delete(code);
  } else if (!sites.size) throw new Error("GeoSite.dat не содержит категорий");
  return sites;
}

export function geoSiteCodes(bytes: Uint8Array) {
  validateSize(bytes);
  const reader = new ProtoReader(bytes);
  const codes = new Set<string>();
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field !== 1 || wire !== 2) {
      reader.skip(wire);
      continue;
    }
    const site = parseSite(reader.message());
    if (!site.code) continue;
    const code = normalizeCode(site.code);
    codes.add(code);
    for (const domain of site.domains) {
      for (const attribute of domain.attributes) codes.add(`${code}@${normalizeCode(attribute)}`);
    }
  }
  filterCodeTags(codes);
  if (codes.has("geolocation-cn")) codes.add("cn");
  if (!codes.size) throw new Error("GeoSite.dat не содержит категорий");
  return codes;
}

function parseSiteCode(reader: ProtoReader) {
  let countryCode = "";
  let code = "";
  while (!reader.done) {
    const tag = reader.tag();
    if (tag.field === 1 && tag.wire === 2) countryCode = reader.string();
    else if (tag.field === 4 && tag.wire === 2) code = reader.string();
    else reader.skip(tag.wire);
  }
  return countryCode || code;
}

function parseSite(reader: ProtoReader) {
  let countryCode = "";
  let code = "";
  const domains: ParsedDomain[] = [];
  while (!reader.done) {
    const tag = reader.tag();
    if (tag.field === 1 && tag.wire === 2) countryCode = reader.string();
    else if (tag.field === 2 && tag.wire === 2) domains.push(parseDomain(reader.message()));
    else if (tag.field === 4 && tag.wire === 2) code = reader.string();
    else reader.skip(tag.wire);
  }
  return { code: countryCode || code, domains };
}

function parseDomain(reader: ProtoReader): ParsedDomain {
  let type = 0;
  let value = "";
  const attributes: string[] = [];
  while (!reader.done) {
    const tag = reader.tag();
    if (tag.field === 1 && tag.wire === 0) type = reader.varint();
    else if (tag.field === 2 && tag.wire === 2) value = reader.string();
    else if (tag.field === 3 && tag.wire === 2) {
      const attribute = parseAttribute(reader.message());
      if (attribute) attributes.push(attribute);
    } else reader.skip(tag.wire);
  }
  return { type, value, attributes };
}

function parseAttribute(reader: ProtoReader) {
  let key = "";
  while (!reader.done) {
    const tag = reader.tag();
    if (tag.field === 1 && tag.wire === 2) key = reader.string();
    else reader.skip(tag.wire);
  }
  return key;
}

function convertDomain(domain: ParsedDomain): GeoSiteDomain[] {
  const value = domain.value.trim();
  if (!value || /[\0\r\n]/.test(value)) throw new Error("GeoSite.dat содержит некорректный доменный шаблон");
  if (domain.type === 0) return [{ matcher: "DOMAIN_KEYWORD", value }];
  if (domain.type === 1) return [{ matcher: "DOMAIN_REGEX", value }];
  if (domain.type === 2) return [
    ...(value.includes(".") ? [{ matcher: "DOMAIN", value } as const] : []),
    { matcher: "SUFFIX", value: `.${value}` },
  ];
  if (domain.type === 3) return [{ matcher: "DOMAIN", value }];
  throw new Error(`GeoSite.dat содержит неизвестный тип домена: ${domain.type}`);
}

function unique(values: GeoSiteDomain[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.matcher}\0${value.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compile(values: GeoSiteDomain[]) {
  const domains = unique(values);
  const suffixes = new Set(domains
    .filter((domain) => domain.matcher === "SUFFIX")
    .map((domain) => domain.value.replace(/^\./, "")));
  return domains.filter((domain) => domain.matcher !== "DOMAIN" || !suffixes.has(domain.value));
}

function relevant(code: string, requested: Set<string>) {
  if (requested.has(code)) return true;
  for (const item of requested) if (item.startsWith(`${code}@`)) return true;
  return (requested.has("cn") || requested.has("geolocation-cn"))
    && (code === "geolocation-cn" || code.startsWith("category-"));
}

// Mirrors the tag normalization used by SagerNet/sing-geosite before SRS generation.
function filterTags(sites: Map<string, GeoSiteDomain[]>) {
  const inverse: Array<{ code: string; excluded: string }> = [];
  for (const code of [...sites.keys()]) {
    const parts = code.split("@");
    if (parts.length !== 2) continue;
    const base = parts[0]!;
    const attribute = parts[1]!;
    const names = base.split("-");
    const last = names.at(-1) || base;
    if (last === attribute) sites.delete(code);
    else if (`!${last}` === attribute || last === `!${attribute}`) inverse.push({ code: base, excluded: code });
  }
  for (const item of inverse) {
    const excluded = sites.get(item.excluded);
    if (!excluded) throw new Error(`GeoSite.dat не содержит исключение ${item.excluded}`);
    const blocked = new Set(excluded.map(domainKey));
    sites.set(item.code, (sites.get(item.code) ?? []).filter((domain) => !blocked.has(domainKey(domain))));
    sites.delete(item.excluded);
  }
}

function filterCodeTags(codes: Set<string>) {
  for (const code of [...codes]) {
    const parts = code.split("@");
    if (parts.length !== 2) continue;
    const base = parts[0]!;
    const attribute = parts[1]!;
    const last = base.split("-").at(-1) || base;
    if (last === attribute || `!${last}` === attribute || last === `!${attribute}`) codes.delete(code);
  }
}

function mergeChineseCategories(sites: Map<string, GeoSiteDomain[]>) {
  const cnCodes = [...sites.keys()].filter((code) => {
    const parts = code.split("@");
    if (parts.length === 2) {
      return parts[1] === "cn" && parts[0]!.startsWith("category-")
        && !parts[0]!.endsWith("-cn") && !parts[0]!.endsWith("-!cn");
    }
    return code.startsWith("category-") && code.endsWith("-cn");
  });
  const merged = unique([
    ...(sites.get("geolocation-cn") ?? []),
    ...cnCodes.flatMap((code) => sites.get(code) ?? []),
  ]);
  if (!merged.length) return;
  sites.set("geolocation-cn", merged);
  sites.set("cn", unique([...merged, { matcher: "SUFFIX", value: ".cn" }]));
}

function domainKey(value: GeoSiteDomain) {
  return `${value.matcher}\0${value.value}`;
}

function normalizeCode(value: string) {
  const code = value.trim().toLowerCase();
  if (!/^[a-z0-9_@.!+-]{1,80}$/.test(code)) throw new Error(`Некорректный GeoSite-код: ${value}`);
  return code;
}

function validateSize(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > maximumDatabaseSize) {
    throw new Error("Некорректный размер GeoSite.dat");
  }
}

class ProtoReader {
  private offset = 0;

  constructor(private bytes: Uint8Array) {}

  get done() {
    return this.offset === this.bytes.byteLength;
  }

  tag() {
    const tag = this.varint();
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (field === 0) throw new Error("Некорректный protobuf-тег GeoSite.dat");
    return { field, wire };
  }

  varint() {
    let result = 0;
    let multiplier = 1;
    for (let index = 0; index < 10; index += 1) {
      const byte = this.byte();
      result += (byte & 0x7f) * multiplier;
      if (result > Number.MAX_SAFE_INTEGER) throw new Error("Слишком большое protobuf-число в GeoSite.dat");
      if ((byte & 0x80) === 0) return result;
      multiplier *= 128;
    }
    throw new Error("Некорректное protobuf-число в GeoSite.dat");
  }

  string() {
    return decoder.decode(this.bytesField());
  }

  message() {
    return new ProtoReader(this.bytesField());
  }

  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.advance(8);
    else if (wire === 2) this.advance(this.varint());
    else if (wire === 5) this.advance(4);
    else throw new Error(`Неподдерживаемый protobuf wire type в GeoSite.dat: ${wire}`);
  }

  bytesField() {
    const length = this.varint();
    const start = this.offset;
    this.advance(length);
    return this.bytes.subarray(start, this.offset);
  }

  private byte() {
    if (this.offset >= this.bytes.byteLength) throw new Error("GeoSite.dat неожиданно закончился");
    return this.bytes[this.offset++]!;
  }

  private advance(length: number) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.byteLength) {
      throw new Error("Некорректная длина поля в GeoSite.dat");
    }
    this.offset += length;
  }
}
