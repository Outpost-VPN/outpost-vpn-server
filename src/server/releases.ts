export type SemVer = {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
};

const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseVersion(value: string): SemVer | null {
  const match = pattern.exec(value);
  if (!match) return null;
  const core = [match[1], match[2], match[3]].map(Number);
  if (core.some((number) => !Number.isSafeInteger(number))) return null;
  const prerelease: Array<number | string> = [];
  for (const identifier of match[4]?.split(".") ?? []) {
    if (!/^\d+$/.test(identifier)) {
      prerelease.push(identifier);
      continue;
    }
    if (identifier.length > 1 && identifier.startsWith("0")) return null;
    const number = Number(identifier);
    if (!Number.isSafeInteger(number)) return null;
    prerelease.push(number);
  }
  return {
    major: core[0]!,
    minor: core[1]!,
    patch: core[2]!,
    prerelease,
  };
}

export function compareVersions(left: string, right: string) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error("Некорректная версия Outpost");
  for (const field of ["major", "minor", "patch"] as const) {
    if (a[field] !== b[field]) return a[field] > b[field] ? 1 : -1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index++) {
    const first = a.prerelease[index];
    const second = b.prerelease[index];
    if (first === undefined || second === undefined) return first === undefined ? -1 : 1;
    if (first === second) continue;
    if (typeof first === "number" && typeof second === "string") return -1;
    if (typeof first === "string" && typeof second === "number") return 1;
    return first > second ? 1 : -1;
  }
  return 0;
}

export function isPrerelease(value: string) {
  return Boolean(parseVersion(value)?.prerelease.length);
}
