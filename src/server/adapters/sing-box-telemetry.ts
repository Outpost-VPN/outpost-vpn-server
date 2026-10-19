import {parse} from "protobufjs";
import {engineApi, engineApiSecret} from "./engine-api";

// Wire-compatible subset of SagerNet/sing-box v1.14.3 daemon/started_service.proto.
// Unknown fields are skipped by protobufjs; no destination/process data is kept.
const events = parse(`syntax = "proto3";
  message Connection { string id = 1; string user = 10; int64 closedAt = 13; int64 uplinkTotal = 16; int64 downlinkTotal = 17; }
  message ConnectionEvent { int32 type = 1; string id = 2; Connection connection = 3; int64 closedAt = 6; }
  message ConnectionEvents { repeated ConnectionEvent events = 1; bool reset = 2; }
`).root.lookupType("ConnectionEvents");

export type SingBoxSession = {id: string; user: string; closedAt: number; uplinkTotal: number; downlinkTotal: number};

export async function singBoxSessions(url = `http://${engineApi["sing-box"]}`, secret = engineApiSecret("sing-box")): Promise<SingBoxSession[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`${url}/daemon.StartedService/SubscribeConnections`, {
      method: "POST",
      headers: {"content-type": "application/grpc-web+proto", "x-grpc-web": "1", authorization: `Bearer ${secret}`},
      // An empty SubscribeConnectionsRequest, framed as a gRPC-Web message.
      body: new Uint8Array(5), signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`sing-box telemetry: HTTP ${response.status}`);
    reader = response.body.getReader();
    let buffer = Buffer.alloc(0);
    while (true) {
      const {done, value} = await reader.read();
      if (done) throw new Error("sing-box telemetry: missing connection snapshot");
      buffer = Buffer.concat([buffer, value]);
      if (buffer.length < 5) continue;
      const length = buffer.readUInt32BE(1);
      if (length > 16 * 1024 * 1024) throw new Error("sing-box telemetry: snapshot too large");
      if (buffer.length < length + 5) continue;
      if (buffer[0] !== 0) throw new Error("sing-box telemetry: connection snapshot unavailable");
      const snapshot = events.toObject(events.decode(buffer.subarray(5, length + 5)), {longs: Number, defaults: true}) as {
        events: Array<{connection: SingBoxSession | null}>;
      };
      return snapshot.events.flatMap((event) => event.connection ? [event.connection] : []);
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
    await reader?.cancel().catch(() => {});
  }
}
