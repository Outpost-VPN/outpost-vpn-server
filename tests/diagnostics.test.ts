import {afterEach, describe, expect, test} from "bun:test";
import {DiagnosticService} from "../src/server/services/diagnostics";
import {ResourceService} from "../src/server/services/resources";
import {OperationService} from "../src/server/services/operations";
import {ConnectionService} from "../src/server/services/connections";
import {diagnosticSchema, diagnosticReportSchema} from "../src/shared/diagnostics";
import {publicAddress, resolveTarget, command, transfer, latency} from "../src/diagnostics/probes";
import {nativeConfig, hysteriaMeasurements} from "../src/diagnostics/client";
import {database} from "./helpers";

const fixtures: ReturnType<typeof database>[] = [];
afterEach(() => {for (const fixture of fixtures.splice(0)) fixture.close();});
const setup = (probe?: ConstructorParameters<typeof DiagnosticService>[4]) => {
  const fixture = database(); fixtures.push(fixture);
  const operations = new OperationService(fixture.db), connections = new ConnectionService(fixture.db);
  const resources = new ResourceService(() => {throw new Error("Unavailable in fixture");}, async () => []);
  return {...fixture, operations, connections, diagnostics: new DiagnosticService(fixture.db, operations, resources, connections, probe)};
};
async function settled(operations: OperationService, id: string) {
  for (let i = 0; i < 100; i++) {if (!["queued", "running"].includes(operations.get(id).status)) return operations.get(id); await Bun.sleep(5);}
  throw new Error("Operation did not settle");
}

describe("bounded diagnostics", () => {
  test("reads only completed Hysteria JSON measurements, excluding progress and private log fields", () => {
    const output = [
      {msg: "downloading", bytes: 1000, speed: "999 Mbps", auth: "private"},
      {msg: "download complete", bytes: 65536, speed: "32.50 Mbps", addr: "private"},
      {msg: "upload complete", bytes: 65536, speed: "1.25 Gbps"},
    ].map(row => JSON.stringify(row)).join("\n");
    expect(hysteriaMeasurements(output)).toEqual({downloadBytes: 65536, downloadMbps: 32.5, uploadBytes: 65536, uploadMbps: 1250});
  });
  test("records stages, measurement direction and simultaneous resources in the existing operations owner", async () => {
    const {diagnostics, operations, db} = setup(async (_request, _signal, emit) => {
      await emit({type: "download", sampledAt: Date.now(), elapsedMs: 10, ok: true, metrics: {bytes: 65536, mbps: 50}});
    });
    const operation = diagnostics.run({kind: "speed", byteLimit: 65536}, "test");
    const result = await settled(operations, operation.id);
    expect(result).toMatchObject({kind: "diagnostic", status: "completed", result: {successful: true, measurementPath: "server-to-origin", observedFrom: "server"}});
    expect(result.result.resourceSummary.samples).toBeGreaterThanOrEqual(2);
    expect(result.result).not.toHaveProperty("resources");
    expect(diagnostics.get(operation.id, true).result.resources.length).toBeGreaterThanOrEqual(2);
    expect(db.raw.query("SELECT COUNT(*) AS count FROM audit_log WHERE action='diagnostic.run'").get()).toEqual({count: 1});
    expect(diagnostics.get(operation.id).result.stages[0].metrics.bytes).toBe(65536);
  });

  test("cancels the actual probe, preserves partial results and rejects overlapping work", async () => {
    let started!: () => void, stopped = false;
    const begun = new Promise<void>(resolve => {started = resolve;});
    const {diagnostics, operations} = setup(async (_request, signal, emit) => {
      await emit({type: "dns", sampledAt: Date.now(), elapsedMs: 1, ok: true, metrics: {}});
      await new Promise<void>((_resolve, reject) => {signal.addEventListener("abort", () => {stopped = true; reject(new Error("cancelled"));}, {once: true}); started();});
    });
    const operation = diagnostics.run({kind: "reachability"}, "test");
    await begun;
    expect(() => diagnostics.run({kind: "latency"}, "test")).toThrow("already running");
    diagnostics.cancel(operation.id, "test");
    await Bun.sleep(5);
    expect(stopped).toBeTrue();
    expect(operations.get(operation.id)).toMatchObject({status: "cancelled", result: {stages: [{type: "dns"}]}});
    expect(diagnostics.cancel(operation.id, "test").status).toBe("cancelled");
  });

  test("claims private profiles once, persists incremental client evidence and never stores credentials", async () => {
    const {diagnostics, operations, connections} = setup();
    const connection = connections.create({name: "Client"}); connections.completeActivation(connection.id, 1, "test");
    const method = "hysteria-hysteria2";
    const operation = diagnostics.run({kind: "compare", vantage: "client", connectionId: connection.id, methodIds: [method]}, "token:test");
    for (let i = 0; i < 100 && operations.get(operation.id).status !== "running"; i++) await Bun.sleep(1);
    expect(() => diagnostics.claim(operation.id, "token:other")).toThrow();
    const claim = diagnostics.claim(operation.id, "token:test");
    expect(claim.profiles).toHaveLength(1);
    expect(() => diagnostics.claim(operation.id, "token:test")).toThrow();
    const report = {runner: {platform: "darwin", interface: "en0", startedAt: Date.now() - 50, finishedAt: Date.now()}, stages: [
      {type: "download", methodId: "direct", sampledAt: Date.now(), elapsedMs: 20, ok: true, metrics: {bytes: 65536}},
      {type: "download", methodId: method, sampledAt: Date.now(), elapsedMs: 20, ok: true, metrics: {bytes: 65536}},
    ]};
    expect(() => diagnostics.report(operation.id, "token:test", "wrong", report)).toThrow();
    diagnostics.report(operation.id, "token:test", claim.reportToken, report, false);
    expect(operations.get(operation.id).result.stages).toHaveLength(2);
    diagnostics.report(operation.id, "token:test", claim.reportToken, report);
    const finished = await settled(operations, operation.id);
    expect(finished).toMatchObject({status: "completed", result: {measurementPath: "client-via-vpn-to-origin", clientEvidence: "reported-by-authorized-runner"}});
    expect(JSON.stringify(finished)).not.toContain(connections.credentials(connection.id).hysteria.password);
    expect(JSON.stringify(finished)).not.toContain(claim.reportToken);
  });

  test("recovers interrupted diagnostics without replaying their network side effects", () => {
    const {db} = setup();
    db.raw.query("INSERT INTO operations(id,kind,status,created_at,updated_at,result_json) VALUES('interrupted','diagnostic','running','old','old','{\"stages\":[1]}')").run();
    const restarted = new OperationService(db);
    expect(restarted.get("interrupted")).toMatchObject({status: "failed", result: {stages: [1]}});
  });

  test("enforces budgets, private target exclusions and safe report fields", async () => {
    expect(diagnosticSchema.safeParse({kind: "compare"}).success).toBeFalse();
    expect(diagnosticSchema.safeParse({kind: "speed", repeat: 3, byteLimit: 64 * 1024 * 1024, direction: "both"}).success).toBeFalse();
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "198.18.0.1", "::1", "::ffff:8.8.8.8", "fd00::1", "fe80::1"]) expect(publicAddress(address)).toBeFalse();
    expect(publicAddress("1.1.1.1")).toBeTrue(); expect(publicAddress("2606:4700:4700::1111")).toBeTrue();
    await expect(resolveTarget("https://127.0.0.1/", "ipv4")).rejects.toThrow("public_addresses");
    await expect(resolveTarget("https://user:password@example.com/", "ipv4")).rejects.toThrow("without_credentials");
    expect(diagnosticReportSchema.safeParse({runner: {platform: "linux", interface: "eth0", startedAt: 1, finishedAt: 2},
      stages: [{type: "client", sampledAt: 1, elapsedMs: 1, ok: false, metrics: {password: "must not persist"}}]}).success).toBeFalse();
  });

  test("terminates a running subprocess and bounds collected output", async () => {
    const controller = new AbortController();
    const task = command([process.execPath, "-e", "setInterval(()=>{},1000)"], controller.signal, 10_000);
    setTimeout(() => controller.abort(), 20);
    await expect(task).rejects.toThrow();
    await expect(command([process.execPath, "-e", "console.log('x'.repeat(4096))"], new AbortController().signal, 1000, undefined, 100)).rejects.toThrow("output limit");
  });

  test("measures bounded HTTP download and upload with the actual curl runner", async () => {
    let received = 0;
    const server = Bun.serve({hostname: "127.0.0.1", port: 0, async fetch(request) {
      if (request.method === "POST") received = (await request.arrayBuffer()).byteLength;
      return new Response(new Uint8Array(request.method === "POST" ? 0 : 65536));
    }});
    try {
      const target = {url: server.url, host: "127.0.0.1", address: "127.0.0.1", port: server.port!};
      const request = diagnosticSchema.parse({kind: "speed", byteLimit: 65536});
      expect((await transfer(target, request, "download", new AbortController().signal)).metrics.bytes).toBe(65536);
      expect((await transfer(target, request, "upload", new AbortController().signal)).ok).toBeTrue();
      expect(received).toBe(65536);
    } finally {server.stop(true);}
  });

  test.skipIf(process.platform !== "darwin")("measures IPv6 ICMP on the selected macOS interface", async () => {
    const result = await latency({url: new URL("http://[::1]"), host: "::1", address: "::1", port: 80}, 1, new AbortController().signal, "lo0");
    expect(result).toMatchObject({ok: true, metrics: {sent: 1, received: 1, icmpLossPercent: 0}});
  });

  test("treats target paths literally and bounds a response without Content-Length", async () => {
    let requests = 0;
    const server = Bun.serve({hostname: "127.0.0.1", port: 0, fetch() {
      requests++;
      return new Response(new ReadableStream({start(controller) {
        for (let i = 0; i < 20; i++) controller.enqueue(new Uint8Array(16384));
        controller.close();
      }}));
    }});
    try {
      const target = {url: new URL("/literal[1-3]", server.url), host: "127.0.0.1", address: "127.0.0.1", port: server.port!};
      const result = await transfer(target, diagnosticSchema.parse({kind: "speed", byteLimit: 65536}), "download", new AbortController().signal);
      expect(requests).toBe(1);
      expect(result).toMatchObject({ok: true, code: "byte_limit", metrics: {bytes: 65536, complete: false}});
    } finally {server.stop(true);}
  });

  test("constructs isolated clients bound to the selected interface without TUN or DNS ownership", () => {
    const base = {methodId: "method", protocol: "hysteria2", config: {server: "1.1.1.1", password: "fixture"}};
    expect(nativeConfig({...base, family: "mihomo"}, 12345, "en0")).toMatchObject({tun: {enable: false}, dns: {enable: false}, proxies: [{"interface-name": "en0"}], "bind-address": "127.0.0.1"});
    expect(nativeConfig({...base, family: "sing-box"}, 12345, "eth0")).toMatchObject({inbounds: [{listen: "127.0.0.1"}], outbounds: [{bind_interface: "eth0"}]});
  });
});
