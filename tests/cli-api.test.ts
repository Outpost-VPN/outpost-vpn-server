import { describe, expect, test } from "bun:test";
import { OutpostApi } from "../src/cli/api";

describe("CLI API errors", () => {
  test("reads the current flat error envelope and keeps the legacy fallback", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/flat") {
          return Response.json({ code: "setup.complete", message: "Initial setup is already complete.", requestId: "request-1" }, { status: 409 });
        }
        return Response.json({ error: { message: "Legacy API error." } }, { status: 400 });
      },
    });
    const api = new OutpostApi({ url: server.url.origin });

    try {
      await expect(api.get("/flat")).rejects.toThrow("Outpost API 409: Initial setup is already complete.");
      await expect(api.get("/legacy")).rejects.toThrow("Outpost API 400: Legacy API error.");
    } finally {
      await server.stop(true);
    }
  });
});
