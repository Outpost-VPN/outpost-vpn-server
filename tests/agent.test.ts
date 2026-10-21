import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callAgent } from "../src/server/services/operations";

describe("root-agent transport", () => {
  test("closes an in-flight diagnostic socket on abort", async () => {
    const directory = await mkdtemp(join(tmpdir(), "outpost-agent-abort-"));
    const socketPath = join(directory, "agent.sock");
    let received!: () => void, closed!: () => void;
    const requestReceived = new Promise<void>(resolve => {received = resolve;});
    const connectionClosed = new Promise<void>(resolve => {closed = resolve;});
    const server = createServer(socket => {
      socket.once("data", received);
      socket.once("end", () => socket.end());
      socket.once("close", closed);
    });
    try {
      await new Promise<void>((resolve, reject) => {server.once("error", reject); server.listen(socketPath, resolve);});
      const controller = new AbortController();
      const task = callAgent({action: "network.ping", payload: {address: "1.1.1.1", count: 30}}, socketPath, controller.signal);
      const rejection = task.then(() => {throw new Error("Cancelled request resolved");}, error => error);
      await requestReceived;
      controller.abort();
      expect((await rejection).message).toContain("cancelled");
      await connectionClosed;
      await expect(callAgent({action: "network.ping", payload: {}}, socketPath, controller.signal)).rejects.toThrow();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(directory, {recursive: true, force: true});
    }
  });

  test("keeps the socket readable until a delayed response arrives", async () => {
    const directory = await mkdtemp(join(tmpdir(), "outpost-agent-"));
    const socketPath = join(directory, "agent.sock");
    const server = createServer({ allowHalfOpen: true }, (socket) => {
      let request = "";
      socket.on("data", (chunk) => {
        request += chunk.toString("utf8");
        if (request.endsWith("\n")) setTimeout(() => socket.end('{"ok":true,"output":"done"}\n'), 20);
      });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });
      const response = await callAgent({ action: "nginx.reload", payload: {} }, socketPath);
      expect(response).toMatchObject({ ok: true, output: "done" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
