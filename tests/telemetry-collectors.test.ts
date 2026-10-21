import {afterEach, describe, expect, test} from "bun:test";
import {parse} from "protobufjs";
import {MihomoCollector, SingBoxCollector, AmneziaCollector} from "../src/server/adapters/traffic-collectors";
import {amneziaPeer} from "../src/server/adapters/amneziawg";
import {TrafficService, type TrafficCollector, type TelemetrySnapshot} from "../src/server/services/traffic";
import {ConnectionService} from "../src/server/services/connections";
import {engineIds, engines, type EngineId} from "../src/shared/engines";
import {database} from "./helpers";

const servers: Bun.Server<unknown>[] = [];
afterEach(() => {for (const server of servers.splice(0)) server.stop(true);});
const serve = (fetch: (request: Request) => Response | Promise<Response>) => {
  const server = Bun.serve({hostname: "127.0.0.1", port: 0, fetch}); servers.push(server); return server.url.origin;
};
const active = (connections: ConnectionService, name: string) => {
  const user = connections.create({name}); connections.completeActivation(user.id, 1, "test"); return user.id;
};

describe("all-engine user telemetry", () => {
  test("treats Mihomo null connections as an empty snapshot and preserves last activity after disconnect", async () => {
    const fixture = database();
    try {
      const connections = new ConnectionService(fixture.db), user = active(connections, "User");
      for (const id of engineIds) fixture.db.engines.recordInstallation(id, engines[id].version);
      let sessions: Array<{id: string; metadata: {inboundUser: string}; upload: number; download: number}> | null = [
        {id: "session", metadata: {inboundUser: user}, upload: 10, download: 50},
      ];
      const url = serve(() => Response.json({connections: sessions}));
      const mihomo = new MihomoCollector(url, "fixture");
      const collectors = engineIds.map((id): TrafficCollector => id === "mihomo" ? mihomo : {
        id, async collect() {return {traffic: [], online: {}};},
      });
      const service = new TrafficService(fixture.db, collectors), at = new Date();
      await service.collect(at);
      expect(connections.get(user).presence?.status).toBe("online");

      sessions = null;
      expect(await mihomo.collect()).toEqual({traffic: [], online: {}});
      await service.collect(new Date(at.getTime() + 5_000));
      await service.collect(new Date(at.getTime() + 10_000));
      expect(connections.get(user)).toMatchObject({
        first_seen_at: at.toISOString(), last_seen_at: at.toISOString(), presence: {status: "offline"},
      });
      expect(fixture.db.raw.query("SELECT status, failures FROM monitor_states WHERE key = 'telemetry:mihomo'").get())
        .toEqual({status: "available", failures: 0});
      expect(service.overview("all").totals).toEqual({upload: 10, download: 50});

      sessions = [];
      expect(await mihomo.collect()).toEqual({traffic: [], online: {}});
    } finally {fixture.close();}
  });

  test("persists independent sessions and sums every engine without recounting a panel restart", async () => {
    const fixture = database();
    try {
      const connections = new ConnectionService(fixture.db);
      const user = active(connections, "First"), second = active(connections, "Second");
      for (const id of engineIds) fixture.db.engines.recordInstallation(id, engines[id].version);
      let sessions = [
        {id: "first", metadata: {inboundUser: `${user}.1@outpost.local`}, upload: 10, download: 50},
        {id: "second", metadata: {inboundUser: `${user}.1`}, upload: 20, download: 70},
        {id: "other-user", metadata: {inboundUser: second}, upload: 9, download: 11},
      ];
      const url = serve((request) => request.headers.get("authorization") === "Bearer fixture"
        ? Response.json({connections: sessions}) : new Response("denied", {status: 401}));
      const collector = new MihomoCollector(url, "fixture");
      let service = new TrafficService(fixture.db, [collector]);
      const start = new Date(), end = new Date(start.getTime() + 10_000);
      await service.collect(start);
      expect(connections.get(user).presence?.status).toBe("online");
      sessions = [{...sessions[1]!, upload: 25, download: 80}, {...sessions[2]!}];
      await service.collect(new Date(start.getTime() + 5_000));
      service = new TrafficService(fixture.db, [collector]);
      await service.collect(end);
      for (const id of engineIds.filter((id) => id !== "mihomo")) service.recordCumulative(id, {connectionId: user, upload: 100, download: 200});
      // Include the final synthetic observation even across a bucket boundary.
      const overview = service.overview("all", "UTC", {to: end.toISOString()});
      expect(overview.connections.find((row) => row.connection_id === user)).toMatchObject({upload: 435, download: 930});
      expect(overview.connections.find((row) => row.connection_id === second)).toMatchObject({upload: 9, download: 11});
      expect(overview.totals).toEqual({upload: 444, download: 941});
      expect(overview.coveredEngines).toEqual(engineIds);
      await expect(new MihomoCollector(url, "wrong").collect()).rejects.toThrow("401");
    } finally {fixture.close();}
  });

  test("combines online state across all engines, distinguishes missing telemetry and ignores removed engines", async () => {
    const fixture = database();
    try {
      const connections = new ConnectionService(fixture.db), user = active(connections, "User");
      for (const id of engineIds) fixture.db.engines.recordInstallation(id, engines[id].version);
      const snapshots: Partial<Record<EngineId, TelemetrySnapshot>> = Object.fromEntries(engineIds.map((id) => [id, {traffic: [], online: {}}]));
      let broken: EngineId | undefined;
      const collectors = engineIds.map((id): TrafficCollector => ({id, async collect() {
        if (id === broken) throw new Error("fixture API unavailable"); return snapshots[id]!;
      }}));
      const service = new TrafficService(fixture.db, collectors), at = new Date();
      for (const id of engineIds) {
        snapshots[id] = {traffic: [], online: {[user]: 1}};
        await service.collect(at);
        expect(connections.get(user).presence?.status).toBe("online");
        snapshots[id] = {traffic: [], online: {}};
        await service.collect(at); await service.collect(at);
        expect(connections.get(user).presence?.status).toBe("offline");
      }
      broken = "sing-box"; await service.collect(at);
      expect(connections.get(user).presence?.status).toBe("unknown");
      snapshots.mihomo = {traffic: [], online: {[user]: 1}}; await service.collect(at);
      expect(connections.get(user).presence?.status).toBe("online");
      fixture.db.engines.recordInstallation("mihomo", "");
      expect(connections.get(user).presence?.status).toBe("unknown");
      expect(connections.get(user).presence?.engines.mihomo).toBeUndefined();
    } finally {fixture.close();}
  });

  test("polls sessions at five seconds and counters at thirty, without overlapping collection", async () => {
    const fixture = database();
    try {
      fixture.db.engines.recordInstallation("mihomo", engines.mihomo.version);
      const calls = {mihomo: 0, xray: 0};
      const service = new TrafficService(fixture.db, (["mihomo", "xray"] as const).map((id) => ({id, intervalMs: id === "mihomo" ? 5_000 : 30_000,
        async collect() {calls[id]++; await Bun.sleep(5); return {traffic: []};}})));
      const at = new Date();
      await Promise.all([service.collect(at), service.collect(at)]);
      await service.collect(new Date(at.getTime() + 5_000));
      await service.collect(new Date(at.getTime() + 30_000));
      expect(calls).toEqual({mihomo: 3, xray: 2});
    } finally {fixture.close();}
  });

  test("maps AWG peer RX/TX to the correct user without requesting private keys", async () => {
    const fixture = database();
    try {
      const connections = new ConnectionService(fixture.db);
      const first = active(connections, "First"), second = active(connections, "Second");
      const credentials = connections.activeCredentials();
      const rows = credentials.map((credential, index) => `${amneziaPeer(credential).publicKey}\t${100 + index}\t${500 + index}`);
      const collector = new AmneziaCollector(() => credentials, async (request) => {
        expect(request).toEqual({action: "telemetry.read", payload: {engine: "amneziawg"}});
        return {output: rows.join("\n")};
      });
      expect((await collector.collect()).traffic).toMatchObject([
        {connectionId: first, upload: 100, download: 500}, {connectionId: second, upload: 101, download: 501},
      ]);
    } finally {fixture.close();}
  });

  test("reads fragmented authenticated sing-box gRPC-Web snapshots and preserves closed-session totals", async () => {
    const type = parse(`syntax="proto3"; message C {string id=1; string user=10; int64 closedAt=13; int64 uplinkTotal=16; int64 downlinkTotal=17;}
      message E {C connection=3;} message S {repeated E events=1;}`).root.lookupType("S");
    const payload = Buffer.from(type.encode({events: [
      {connection: {id: "a", user: "user.2@outpost.local", uplinkTotal: 100, downlinkTotal: 9_000_000_000}},
      {connection: {id: "b", user: "user.2", uplinkTotal: 50, downlinkTotal: 60, closedAt: 1}},
    ]}).finish());
    const header = Buffer.alloc(5); header.writeUInt32BE(payload.length, 1);
    const url = serve((request) => {
      expect(request.headers.get("authorization")).toBe("Bearer fixture");
      expect(new URL(request.url).pathname).toBe("/daemon.StartedService/SubscribeConnections");
      return new Response(new ReadableStream({start(controller) {
        controller.enqueue(header.subarray(0, 2)); controller.enqueue(Buffer.concat([header.subarray(2), payload])); controller.close();
      }}));
    });
    expect(await new SingBoxCollector(url, "fixture").collect()).toEqual({online: {user: 1}, traffic: [
      {connectionId: "user", counterId: "a", upload: 100, download: 9_000_000_000},
      {connectionId: "user", counterId: "b", upload: 50, download: 60},
    ]});
    const denied = serve(() => new Response("denied", {status: 401}));
    await expect(new SingBoxCollector(denied, "fixture").collect()).rejects.toThrow("401");
  });
});
