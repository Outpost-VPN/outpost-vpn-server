import {test, expect} from "bun:test";
import {clientProfiles, methodUsage} from "../src/shared/connection-methods";
import {engineRunning} from "../src/shared/engines";
import {reorder} from "../src/shared/reorder";

test("client guidance distinguishes broad support, required runtimes and standalone routing", () => {
  expect(methodUsage({protocol: "hysteria2"}).clients).toEqual(["Mihomo", "sing-box"]);
  expect(methodUsage({protocol: "xhttp"}).clients).toEqual(["Mihomo", "Xray"]);
  const anytls = methodUsage({protocol: "anytls"});
  expect(anytls.clients).toEqual(["Mihomo ≥1.19.4", "sing-box ≥1.12.0"]);
  expect(anytls.standalone).toEqual([]);
  const awg = methodUsage({protocol: "amneziawg"});
  expect(awg.routed.map((profile) => profile.client)).toEqual(["Mihomo"]);
  expect(awg.standalone.map((profile) => profile.client)).toEqual(["AmneziaVPN"]);
  const naive = methodUsage({protocol: "naive"});
  expect(naive.clients).toEqual(["sing-box ≥1.13.0 · Naive: Cronet"]);
  expect(naive.standalone.map((profile) => profile.client)).toEqual(["NaiveProxy"]);
});

test("routing metadata keeps complete profiles, client-dependent URI imports and raw exports distinct", () => {
  for (const id of ["mihomo", "mihomo-modern", "sing-box", "sing-box-modern", "xray-json"] as const) expect(clientProfiles[id].routing).toBe("embedded");
  expect(clientProfiles.links.routing).toBe("client");
  for (const id of ["amneziawg", "naive"] as const) expect(clientProfiles[id].routing).toBe("none");
  expect(methodUsage({protocol: "grpc"}).standalone).toEqual([]);
});

test("reordering handles moves in both directions without mutating the server snapshot", () => {
  const items = ["a", "b", "c", "d"].map((id) => ({id}));
  expect(reorder(items, "a", "c", true).map((item) => item.id)).toEqual(["b", "c", "a", "d"]);
  expect(reorder(items, "d", "b").map((item) => item.id)).toEqual(["a", "d", "b", "c"]);
  expect(reorder(items, "b", "a", true)).toEqual(items);
  expect(reorder(items, "missing", "a")).toEqual(items);
  expect(reorder(items, "a", "missing")).toEqual(items);
  expect(items.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
});

test("protocol and engine status use the same observed service state", () => {
  expect(engineRunning([{name: "outpost-mihomo", status: "active"}], "mihomo")).toBeTrue();
  expect(engineRunning([{name: "outpost-mihomo", status: "inactive"}], "mihomo")).toBeFalse();
  expect(engineRunning([{name: "xray", status: "active"}], "mihomo")).toBeFalse();
});
