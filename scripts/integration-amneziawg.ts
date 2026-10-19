import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { amneziaSnapshot, amneziaClient, amneziaProxy } from "../src/server/adapters/amneziawg";
import { command, expectBody, ProcessGroup } from "./lib/native-integration";

// This runner deliberately exercises real systemd, TUN, namespaces and iptables.
// It is only for a disposable Linux VM explicitly marked by its creator.
if (process.platform !== "linux" || process.getuid?.() !== 0 || !existsSync("/etc/outpost-protocol-lab")) throw new Error("Requires the isolated Outpost protocol test VM");
const root = process.cwd();
const processes = new ProcessGroup();
const runtime = "/var/lib/outpost/runtime";
mkdirSync(runtime, { recursive: true });
const initial = { connectionId: "lab", serial: 1, generation: 1, hysteria: { id: "lab", password: "lab-only-password" }, xray: { id: crypto.randomUUID(), email: "lab.1@outpost.local" } };
const next = { ...initial, generation: 2 };
const fixture = (name: string, credential: typeof initial) => {
  const path = join(runtime, name);
  const native = amneziaClient(credential, 1, "10.79.0.1").split("\n").filter((line) => !/^(Address|DNS|MTU) = /.test(line)).join("\n");
  writeFileSync(path, native, { mode: 0o600 });
  return path;
};
const clientInitial = fixture("awg-client-initial.conf", initial);
const clientNext = fixture("awg-client-next.conf", next);
const writeSnapshot = (credentials: typeof initial[]) => {
  const path = join(runtime, "awg-snapshot.json");
  writeFileSync(path, JSON.stringify(amneziaSnapshot(credentials)), { mode: 0o600 });
  return path;
};
const awg = "/opt/outpost/engines/amneziawg/current/awg";
async function ip(...args: string[]) { return command(["ip", ...args]); }
async function request(succeeds: boolean, address = "198.18.0.2") {
  let success = false;
  try {
    const body = await command(["ip", "netns", "exec", "outpost-client", "curl", "--noproxy", "", "-fsS", "--max-time", "2", `http://${address}:8080/`]);
    success = body.includes("verified-awg-origin");
  } catch {}
  if (success !== succeeds) throw new Error(`AWG request to ${address}: expected ${succeeds ? "transfer" : "rejection"}`);
}
async function synchronize(credentials: typeof initial[]) {
  await command([join(root, "infra/scripts/apply-config"), writeSnapshot(credentials), "/etc/outpost/engines/amneziawg.json", "amneziawg", "sync"]);
}
try {
  await ip("netns", "add", "outpost-client");
  await ip("netns", "add", "outpost-origin");
  await ip("link", "add", "outpost-veth", "type", "veth", "peer", "name", "eth0", "netns", "outpost-client");
  await ip("addr", "add", "10.79.0.1/30", "dev", "outpost-veth");
  await ip("link", "set", "outpost-veth", "up");
  await ip("-n", "outpost-client", "addr", "add", "10.79.0.2/30", "dev", "eth0");
  await ip("-n", "outpost-client", "link", "set", "eth0", "up");
  await ip("-n", "outpost-client", "link", "set", "lo", "up");
  await ip("link", "add", "outpost-origin", "type", "veth", "peer", "name", "eth0", "netns", "outpost-origin");
  await ip("addr", "add", "198.18.0.1/30", "dev", "outpost-origin");
  await ip("addr", "add", "10.81.0.1/30", "dev", "outpost-origin");
  await ip("link", "set", "outpost-origin", "up");
  await ip("-n", "outpost-origin", "addr", "add", "198.18.0.2/30", "dev", "eth0");
  await ip("-n", "outpost-origin", "addr", "add", "10.81.0.2/30", "dev", "eth0");
  await ip("-n", "outpost-origin", "link", "set", "eth0", "up");
  await ip("-n", "outpost-origin", "route", "add", "default", "via", "198.18.0.1");
  processes.launch(["ip", "netns", "exec", "outpost-origin", process.execPath, "-e", 'Bun.serve({hostname:"0.0.0.0",port:8080,fetch:()=>new Response("verified-awg-origin")})']);
  await Bun.sleep(300);
  await expectBody(["curl", "--noproxy", "", "-fsS", "--max-time", "2", "http://10.81.0.2:8080/"], "verified-awg-origin");
  writeFileSync("/etc/outpost/engines/amneziawg.json", JSON.stringify(amneziaSnapshot([initial])), { mode: 0o640 });
  await command(["systemctl", "start", "outpost-amneziawg"]);
  await command([join(root, "infra/scripts/engine-health"), "amneziawg"]);
  const serverPid = await command(["systemctl", "show", "outpost-amneziawg", "--property=MainPID", "--value"]);
  const nativeClient = processes.launch(["ip", "netns", "exec", "outpost-client", "/opt/outpost/engines/amneziawg/current/amneziawg-go", "-f", "awg-client"]);
  await Bun.sleep(500);
  await command(["ip", "netns", "exec", "outpost-client", awg, "setconf", "awg-client", clientInitial]);
  await ip("-n", "outpost-client", "addr", "add", "10.78.0.2/32", "dev", "awg-client");
  await ip("-n", "outpost-client", "link", "set", "awg-client", "mtu", "1280", "up");
  await ip("-n", "outpost-client", "route", "add", "198.18.0.2/32", "dev", "awg-client");
  await ip("-n", "outpost-client", "route", "add", "10.81.0.2/32", "dev", "awg-client");
  await request(true);
  await request(false, "10.81.0.2");
  console.log("AWG 3.1: authenticated forwarding/NAT and private-network rejection passed");
  await synchronize([]);
  await request(false);
  await synchronize([next]);
  await request(false);
  await command(["ip", "netns", "exec", "outpost-client", awg, "setconf", "awg-client", clientNext]);
  await request(true);
  if (await command(["systemctl", "show", "outpost-amneziawg", "--property=MainPID", "--value"]) !== serverPid) throw new Error("Peer synchronization restarted the server");
  console.log("AWG 3.1: revocation, rotation and new-key transfer passed without a server restart");
  nativeClient.kill(); await nativeClient.exited;
  const home = join(runtime, "mihomo-awg-test");
  mkdirSync(home, { recursive: true });
  const proxy = amneziaProxy(next, 1, "10.79.0.1");
  const path = join(home, "config.yaml");
  writeFileSync(path, YAML.stringify({ "mixed-port": 2080, "bind-address": "127.0.0.1", mode: "rule", "log-level": "error", proxies: [proxy], rules: [`MATCH,${proxy.name}`] }), { mode: 0o600 });
  processes.launch(["ip", "netns", "exec", "outpost-client", join(root, ".cache/native-tools/mihomo"), "-d", home, "-f", path]);
  await expectBody(["ip", "netns", "exec", "outpost-client", "curl", "--noproxy", "", "-fsS", "--max-time", "3", "--socks5-hostname", "127.0.0.1:2080", "http://198.18.0.2:8080/"], "verified-awg-origin");
  console.log("AWG 3.1: native Mihomo client transfer passed with header protection, random trailers and disabled cookies");
} catch (error) {
  for (const argv of [["ip", "route"], ["ip", "netns", "exec", "outpost-origin", "ss", "-lntp"], ["ip", "-n", "outpost-origin", "address"]]) {
    try { console.error(await command(argv)); } catch {}
  }
  throw error;
} finally {
  await processes.close();
  try { await command(["systemctl", "stop", "outpost-amneziawg"]); } catch {}
  for (const name of ["outpost-client", "outpost-origin"]) { try { await ip("netns", "delete", name); } catch {} }
  for (const name of ["outpost-veth", "outpost-origin"]) { try { await ip("link", "delete", name); } catch {} }
}
