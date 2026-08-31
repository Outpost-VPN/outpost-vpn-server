export type GeoSiteFixtureDomain = {
  type: 0 | 1 | 2 | 3;
  value: string;
  attributes?: string[];
};

export function geoSiteDatabase(sites: Record<string, GeoSiteFixtureDomain[]>) {
  return Buffer.concat(Object.entries(sites).map(([code, domains]) => fieldMessage(1, siteMessage(code, domains))));
}

function siteMessage(code: string, domains: GeoSiteFixtureDomain[]) {
  return Buffer.concat([
    fieldString(1, code),
    ...domains.map((domain) => fieldMessage(2, domainMessage(domain))),
  ]);
}

function domainMessage(domain: GeoSiteFixtureDomain) {
  return Buffer.concat([
    fieldVarint(1, domain.type),
    fieldString(2, domain.value),
    ...(domain.attributes ?? []).map((attribute) => fieldMessage(3, fieldString(1, attribute))),
  ]);
}

function fieldString(field: number, value: string) {
  return fieldMessage(field, Buffer.from(value, "utf8"));
}

function fieldMessage(field: number, value: Uint8Array) {
  return Buffer.concat([varint((field << 3) | 2), varint(value.byteLength), value]);
}

function fieldVarint(field: number, value: number) {
  return Buffer.concat([varint(field << 3), varint(value)]);
}

function varint(value: number) {
  const bytes: number[] = [];
  let remaining = value;
  do {
    const byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    bytes.push(byte | (remaining ? 0x80 : 0));
  } while (remaining);
  return Buffer.from(bytes);
}
