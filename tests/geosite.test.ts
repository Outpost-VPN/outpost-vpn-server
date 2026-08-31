import { describe, expect, test } from "bun:test";
import { geoSiteCodes, parseGeoSiteDatabase } from "../src/server/adapters/geosite";
import { geoSiteDatabase } from "./geosite-fixture";

describe("GeoSite database parser", () => {
  test("preserves exact, suffix, keyword and regex semantics", () => {
    const sites = parseGeoSiteDatabase(geoSiteDatabase({
      "CATEGORY-ADS-ALL": [
        { type: 2, value: "ads.example" },
        { type: 3, value: "exact.example" },
        { type: 0, value: "sponsor" },
        { type: 1, value: String.raw`^ad\d+\.example$` },
        { type: 3, value: "exact.example" },
      ],
    }));

    expect(sites.get("category-ads-all")).toEqual([
      { matcher: "SUFFIX", value: ".ads.example" },
      { matcher: "DOMAIN", value: "exact.example" },
      { matcher: "DOMAIN_KEYWORD", value: "sponsor" },
      { matcher: "DOMAIN_REGEX", value: String.raw`^ad\d+\.example$` },
    ]);
  });

  test("builds attribute categories and rejects malformed data", () => {
    const database = geoSiteDatabase({
      test: [{ type: 3, value: "cn.example", attributes: ["CN"] }, { type: 3, value: "global.example" }],
      ignored: [{ type: 3, value: "ignored.example" }],
    });
    const sites = parseGeoSiteDatabase(database, ["test@cn"]);
    expect(sites.get("test@cn")).toEqual([{ matcher: "DOMAIN", value: "cn.example" }]);
    expect(sites.has("ignored")).toBeFalse();
    expect(geoSiteCodes(database)).toEqual(new Set(["test", "test@cn", "ignored"]));
    expect(() => parseGeoSiteDatabase(new Uint8Array([0x0a, 0x05, 0x01]))).toThrow();
  });
});
