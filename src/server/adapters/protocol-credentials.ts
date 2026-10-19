import { createHmac } from "node:crypto";
import type { ConnectionCredential } from "../models";

// Domain-separated keys retain the existing encrypted credential generation as
// the single lifecycle owner. Rotation changes every derived protocol password.
export function protocolCredential(credential: ConnectionCredential, protocol: "anytls" | "trusttunnel" | "naive") {
  return {
    username: `${credential.connectionId}.${credential.generation}`,
    password: createHmac("sha256", credential.hysteria.password)
      .update(`outpost:${protocol}:v1\0${credential.connectionId}\0${credential.generation}`)
      .digest("base64url"),
  };
}
