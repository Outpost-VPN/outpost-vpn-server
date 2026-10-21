import {readFileSync, statfsSync} from "node:fs";
import {cpus, freemem, loadavg, totalmem, uptime} from "node:os";
import {serviceNames} from "../../shared/engines";
import {config} from "../config";

type Counters = Record<string, number>;
type Cpu = {total: number; idle: number; steal: number};
type ProcessCounter = {service: string; pid: number; cpuNs: string | null; memory: number | null; rss: number | null};
export type ResourceSnapshot = ReturnType<ResourceService["current"]>;
export type ResourceSample = NonNullable<ResourceSnapshot["snapshot"]>;
const percent = (used: number, total: number) => total > 0 ? Math.round(used / total * 10_000) / 100 : null;

export function diskUsage(path: string) {
  const value = statfsSync(path), total = Number(value.blocks) * Number(value.bsize), used = total - Number(value.bavail) * Number(value.bsize);
  return {total, used, percent: percent(used, total)};
}

export function summarizeResources(samples: ResourceSample[]) {
  const stats = (values: Array<number | null | undefined>) => {
    const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return {min: known.length ? Math.min(...known) : null, sampleMean: known.length ? known.reduce((a,b) => a+b,0) / known.length : null, max: known.length ? Math.max(...known) : null};
  };
  return {samples: samples.length, from: samples[0]?.sampledAt ?? null, to: samples.at(-1)?.sampledAt ?? null,
    cpuPercent: stats(samples.map(sample => sample.cpu.percent)), stealPercent: stats(samples.map(sample => sample.cpu.stealPercent)),
    availableMemoryBytes: stats(samples.map(sample => sample.memory?.available)), swapUsedBytes: stats(samples.map(sample => sample.memory?.swapUsed)),
    services: [...new Set(samples.flatMap(sample => sample.services.map(service => service.service)))].map(service => ({service,
      cpuPercent: stats(samples.map(sample => sample.services.find(row => row.service === service)?.cpuPercent)),
      rssBytes: stats(samples.map(sample => sample.services.find(row => row.service === service)?.rss))})),
  };
}

export function parseCpu(text: string): Cpu {
  const values = text.split("\n").find(line => /^cpu\s/.test(line))?.trim().split(/\s+/).slice(1).map(Number);
  if (!values || values.length < 8 || !values.every(Number.isFinite)) throw new Error("CPU counters unavailable");
  return {total: values.slice(0, 8).reduce((sum, n) => sum + n, 0), idle: values[3]! + values[4]!, steal: values[7]!};
}

export function parseMemory(text: string) {
  const values = Object.fromEntries([...text.matchAll(/^(\w+):\s+(\d+) kB/gm)].map(m => [m[1], Number(m[2]) * 1024]));
  if (!values.MemTotal || values.MemAvailable === undefined) throw new Error("Memory counters unavailable");
  const used = Math.max(0, values.MemTotal - values.MemAvailable);
  return {total: values.MemTotal, available: values.MemAvailable, used, percent: percent(used, values.MemTotal),
    swapTotal: values.SwapTotal ?? null, swapUsed: values.SwapTotal !== undefined && values.SwapFree !== undefined ? values.SwapTotal - values.SwapFree : null};
}

export function parseNetwork(dev: string, snmp: string) {
  const interfaces: Record<string, Counters> = {};
  for (const line of dev.split("\n").slice(2)) {
    const [rawName, raw] = line.split(":");
    if (!rawName || !raw) continue;
    const v = raw.trim().split(/\s+/).map(Number);
    if (v.length < 16 || !v.every(Number.isFinite)) throw new Error("Invalid interface counters");
    interfaces[rawName.trim()] = {received: v[0]!, rxPackets: v[1]!, rxErrors: v[2]!, rxDrops: v[3]!,
      transmitted: v[8]!, txPackets: v[9]!, txErrors: v[10]!, txDrops: v[11]!};
  }
  const counters: Counters = {};
  const lines = snmp.trim().split("\n");
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const names = lines[i]!.trim().split(/\s+/), values = lines[i + 1]!.trim().split(/\s+/);
    if (names[0] !== values[0]) continue;
    names.slice(1).forEach((name, index) => {
      if (["RetransSegs", "OutSegs", "InErrors", "RcvbufErrors", "SndbufErrors", "InDatagrams", "OutDatagrams"].includes(name))
        counters[`${names[0]!.replace(":", "")}.${name}`] = Number(values[index + 1]);
    });
  }
  return {interfaces, counters};
}

async function processCounters(): Promise<ProcessCounter[]> {
  if (process.platform !== "linux") return [];
  const child = Bun.spawn(["systemctl", "show", ...serviceNames, "--property=Id,MainPID,CPUUsageNSec,MemoryCurrent"], {stdout: "pipe", stderr: "ignore"});
  const timer = setTimeout(() => child.kill(), 2_000);
  try {
    const [text, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    if (code !== 0 && !text.trim()) throw new Error("Service metrics unavailable");
    return text.trim().split(/\n\s*\n/).flatMap(block => {
      const row = Object.fromEntries(block.split("\n").map(line => {const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)];}));
      const service = row.Id?.replace(/\.service$/, "");
      if (!service || !serviceNames.includes(service)) return [];
      const pid = Number(row.MainPID ?? 0);
      let rss: number | null = null;
      try {rss = Number(readFileSync(`/proc/${pid}/status`, "utf8").match(/^VmRSS:\s+(\d+)/m)?.[1]) * 1024; if (!Number.isFinite(rss)) rss = null;} catch {}
      const memory = Number(row.MemoryCurrent);
      return [{service, pid, cpuNs: /^\d+$/.test(row.CPUUsageNSec ?? "") && row.CPUUsageNSec !== "18446744073709551615" ? row.CPUUsageNSec! : null,
        memory: Number.isSafeInteger(memory) && memory >= 0 ? memory : null, rss}];
    });
  } finally {clearTimeout(timer);}
}

export class ResourceService {
  private previous?: {at: number; cpu: Cpu | null; network: ReturnType<typeof parseNetwork> | null; processes: ProcessCounter[]};
  private latest: ReturnType<ResourceService["read"]> | null = null;
  private history: Array<{sampledAt: number; cpu: number | null; memoryAvailable: number | null; download: number | null; upload: number | null}> = [];
  private pending: Promise<void> | null = null;

  constructor(private reader = (path: string) => readFileSync(path, "utf8"), private processes = processCounters, private clock = Date.now, private platform = process.platform) {}

  async sample() {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const errors: string[] = [];
      const processes = await this.processes().catch(() => {errors.push("Service metrics unavailable"); return [];});
      const at = this.clock();
      this.latest = this.read(at, processes, errors);
      this.history.push({sampledAt: at, cpu: this.latest.cpu.percent, memoryAvailable: this.latest.memory?.available ?? null,
        download: this.latest.network?.download ?? null, upload: this.latest.network?.upload ?? null});
      this.history = this.history.filter(point => at - point.sampledAt <= 10 * 60_000).slice(-120);
    })().finally(() => {this.pending = null;});
    return this.pending;
  }

  current() {
    return {sampledAt: this.latest?.sampledAt ?? null, ageMs: this.latest ? Math.max(0, this.clock() - this.latest.sampledAt) : null,
      stale: !this.latest || this.clock() - this.latest.sampledAt > 15_000, snapshot: this.latest, history: this.history};
  }

  metrics() {
    const state = this.current(), sample = state.snapshot;
    if (!sample) return null;
    return {cpu: sample.cpu, memory: sample.memory ?? {used: null, total: null, percent: null},
      disk: sample.disk ?? {used: null, total: null, percent: null},
      network: {...sample.network, history: state.history.map(point => ({download: point.download, upload: point.upload, sampledAt: new Date(point.sampledAt).toISOString()}))},
      sampledAt: sample.sampledAt, stale: state.stale};
  }

  private read(at: number, processes: ProcessCounter[], errors: string[]) {
    const safely = <T>(name: string, read: () => T): T | null => {try {return read();} catch {errors.push(`${name} unavailable`); return null;}};
    const cpu = safely("CPU", () => this.platform === "linux" ? parseCpu(this.reader("/proc/stat")) : cpus().reduce((out, cpu) => ({
      total: out.total + Object.values(cpu.times).reduce((a, b) => a + b, 0), idle: out.idle + cpu.times.idle, steal: 0}), {total: 0, idle: 0, steal: 0}));
    const memory = safely("Memory", () => this.platform === "linux" ? parseMemory(this.reader("/proc/meminfo")) : {
      total: totalmem(), available: freemem(), used: totalmem() - freemem(), percent: percent(totalmem() - freemem(), totalmem()), swapTotal: null, swapUsed: null});
    const network = safely("Network", () => parseNetwork(this.reader("/proc/net/dev"), this.reader("/proc/net/snmp")));
    const disk = safely("Disk", () => diskUsage(config.dataDir));
    const previous = this.previous, intervalMs = previous ? at - previous.at : null;
    const total = cpu && previous?.cpu ? cpu.total - previous.cpu.total : 0;
    const validCpu = total > 0 && cpu!.idle >= previous!.cpu!.idle && cpu!.steal >= previous!.cpu!.steal;
    const cpuPercent = validCpu ? percent(total - (cpu!.idle - previous!.cpu!.idle) - (cpu!.steal - previous!.cpu!.steal), total) : null;
    const deltas = (current: Counters, old: Counters | undefined) => Object.fromEntries(Object.entries(current).map(([name, value]) => [name, old && value >= old[name]! ? value - old[name]! : null]));
    const interfaces = network ? Object.entries(network.interfaces).map(([name, counters]) => ({name, counters, delta: deltas(counters, previous?.network?.interfaces[name])})) : [];
    // The default-route interface avoids double counting forwarded traffic on VPN interfaces.
    const primary = safely("Default interface", () => this.reader("/proc/net/route").split("\n").slice(1)
      .map(line => line.trim().split(/\s+/)).find(row => row[1] === "00000000" && (Number.parseInt(row[3] ?? "0", 16) & 1))?.[0]
      ?? this.reader("/proc/net/ipv6_route").split("\n").map(line => line.trim().split(/\s+/))
        .find(row => row[0] === "0".repeat(32) && row[1] === "00" && (Number.parseInt(row[8] ?? "0", 16) & 1))?.at(-1) ?? null);
    const active = interfaces.find(iface => iface.name === primary);
    const rate = (value: number | null | undefined) => value !== null && value !== undefined && intervalMs && intervalMs > 0 ? value * 1000 / intervalMs : null;
    const services = processes.map(row => {
      const old = previous?.processes.find(old => old.service === row.service && old.pid === row.pid);
      const delta = row.cpuNs !== null && old?.cpuNs !== null && old?.cpuNs !== undefined ? BigInt(row.cpuNs) - BigInt(old.cpuNs) : null;
      return {service: row.service, pid: row.pid, rss: row.rss, memory: row.memory,
        cpuPercent: delta !== null && delta >= 0 && intervalMs && intervalMs > 0 ? Number(delta) / (intervalMs * 10_000) : null};
    });
    this.previous = {at, cpu, network, processes};
    return {sampledAt: at, intervalMs, platform: this.platform, uptime: uptime(), cpu: {percent: cpuPercent, stealPercent: validCpu ? percent(cpu!.steal - previous!.cpu!.steal, total) : null, count: cpus().length, load: loadavg()},
      memory, disk, network: network ? {primary, download: rate(active?.delta.received), upload: rate(active?.delta.transmitted), interfaces,
        counters: network.counters, delta: deltas(network.counters, previous?.network?.counters), lossPercent: null} : null, services, errors};
  }
}
