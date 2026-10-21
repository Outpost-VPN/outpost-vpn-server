import { createConnection, createServer } from "node:net";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dir, "../..");

export class ProcessGroup {
  private children: Bun.Subprocess[] = [];
  launch(argv: string[], env?: Record<string, string>) {
    const child = Bun.spawn(argv, { stdout: "inherit", stderr: "inherit", env: { ...process.env, ...env } });
    this.children.push(child);
    return child;
  }
  async close() {
    for (const child of this.children.reverse()) child.kill();
    await Promise.all(this.children.map((child) => child.exited));
  }
}

export function binary(environment: string, fallback: string) {
  const bundled = resolve(root, ".cache", "native-tools", fallback);
  const value = process.env[environment] || (Bun.file(bundled).size ? bundled : Bun.which(fallback));
  if (!value) throw new Error(`${fallback} not found; set ${environment}`);
  return value;
}

export async function command(argv: string[]) {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`${argv[0]} failed: ${error.trim()}`);
  return output;
}

export async function expectBody(argv: string[], expected: string, attempts = 20) {
  let last = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    if (code === 0 && stdout.includes(expected)) return stdout;
    last = stderr.trim() || stdout.trim() || `exit ${code}`;
    await Bun.sleep(200);
  }
  throw new Error(`Proxy request did not succeed: ${last}`);
}

export async function waitForPort(port: number) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await portIsOpen(port)) return;
    await Bun.sleep(100);
  }
  throw new Error(`Port ${port} did not open`);
}

function portIsOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(250, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export async function freePorts(count: number) {
  const ports = new Set<number>();
  while (ports.size < count) ports.add(await freePort());
  return [...ports];
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Cannot allocate a local port"));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

export function listen(server: ReturnType<typeof createServer>) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Cannot start the local origin"));
      resolve(address.port);
    });
  });
}
