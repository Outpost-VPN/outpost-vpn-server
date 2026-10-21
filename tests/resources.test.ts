import {describe, expect, test} from "bun:test";
import {ResourceService, parseCpu, parseMemory, parseNetwork} from "../src/server/services/resources";

const memory = "MemTotal: 1000 kB\nMemFree: 50 kB\nMemAvailable: 600 kB\nSwapTotal: 500 kB\nSwapFree: 400 kB\n";
const network = (rx: number, tx: number) => `header\nheader\neth0: ${rx} 1 0 0 0 0 0 0 ${tx} 1 0 0 0 0 0 0\ntun0: 999999 0 0 0 0 0 0 0 999999 0 0 0 0 0 0 0\n`;

describe("owned resource sampling", () => {
  test("uses available memory, excludes guest double-counting and retains independent network indicators", () => {
    expect(parseMemory(memory)).toMatchObject({total: 1024000, available: 614400, used: 409600, percent: 40, swapUsed: 102400});
    expect(parseCpu("cpu 100 0 100 800 0 0 0 0 99 20")).toEqual({total: 1000, idle: 800, steal: 0});
    expect(parseNetwork(network(10, 20), "Tcp: OutSegs RetransSegs\nTcp: 100 2\nUdp: InDatagrams InErrors RcvbufErrors SndbufErrors\nUdp: 90 3 1 2\n").counters)
      .toEqual({"Tcp.OutSegs": 100, "Tcp.RetransSegs": 2, "Udp.InDatagrams": 90, "Udp.InErrors": 3, "Udp.RcvbufErrors": 1, "Udp.SndbufErrors": 2});
  });

  test("measures CPU and steal deltas, selects the default interface and resets per-service baselines on PID changes", async () => {
    let at = 1_700_000_000_000, second = false, pid = 42;
    const resources = new ResourceService(path => {
      if (path === "/proc/stat") return second ? "cpu 130 0 120 840 0 0 0 10" : "cpu 100 0 100 800 0 0 0 0";
      if (path === "/proc/meminfo") return memory;
      if (path === "/proc/net/dev") return second ? network(200, 400) : network(100, 200);
      if (path === "/proc/net/snmp") return "Tcp: RetransSegs\nTcp: 2\n";
      if (path === "/proc/net/route") return "Iface Destination Gateway Flags\neth0 00000000 01010101 0003\n";
      throw new Error("Missing fixture");
    }, async () => [{service: "hysteria-server", pid, cpuNs: second ? "7500000000" : "5000000000", memory: 64000, rss: 32000}], () => at, "linux");
    await resources.sample();
    expect(resources.current().snapshot?.cpu.percent).toBeNull();
    second = true; at += 5000; await resources.sample();
    expect(resources.current().snapshot).toMatchObject({intervalMs: 5000, cpu: {percent: 50, stealPercent: 10},
      network: {primary: "eth0", download: 20, upload: 40, lossPercent: null}, services: [{service: "hysteria-server", cpuPercent: 50}]});
    pid = 99; at += 5000; await resources.sample();
    expect(resources.current().snapshot?.services[0]?.cpuPercent).toBeNull();
    at += 16_000; expect(resources.current().stale).toBeTrue();
  });

  test("returns unknown for missing counters and bounds history without fabricating zero usage", async () => {
    let at = 1000;
    const resources = new ResourceService(() => {throw new Error("private raw error must not escape");}, async () => [], () => at, "linux");
    for (let i = 0; i < 125; i++) {at += 5000; await resources.sample();}
    expect(resources.current().snapshot).toMatchObject({cpu: {percent: null}, memory: null, network: null});
    expect(resources.current().history.length).toBeLessThanOrEqual(120);
    expect(JSON.stringify(resources.current())).not.toContain("private raw error");
    expect(() => parseCpu("broken")).toThrow();
    expect(() => parseMemory("MemTotal: 10 kB")).toThrow();
  });
});
