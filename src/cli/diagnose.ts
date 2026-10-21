import {z} from "zod";
import {OutpostApi} from "../shared/api";
import {remoteDiagnostic} from "../diagnostics/client";

export async function diagnose(args: string[]) {
  const option = (name: string) => {const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;};
  const id = z.string().uuid().parse(option("--operation"));
  const networkInterface = z.string().min(1).max(80).parse(option("--interface"));
  const url = process.env.OUTPOST_URL;
  if (!url || !process.env.OUTPOST_TOKEN) throw new Error("Set OUTPOST_URL and OUTPOST_TOKEN in the environment");
  const origin = new URL(url);
  if (origin.username || origin.password || origin.search || origin.hash || origin.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Use an HTTPS Outpost origin without credentials");
  const api = new OutpostApi({url, token: process.env.OUTPOST_TOKEN, timeoutMs: 5000});
  const controller = new AbortController(), stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    console.log(JSON.stringify(await remoteDiagnostic(api, id, {interface: networkInterface, mihomo: option("--mihomo"), singBox: option("--sing-box"),
      hysteria: option("--hysteria"), python: option("--python"), curl: option("--curl"), dnsServer: option("--dns-server")}, controller.signal), null, 2));
  } finally {process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);}
}
