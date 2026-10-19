import {createHmac} from "node:crypto";
import {config} from "../config";

export const engineApi = {
  hysteria: "127.0.0.1:9999", xray: "127.0.0.1:10085",
  mihomo: "127.0.0.1:9097", "sing-box": "127.0.0.1:10086",
};

export function engineApiSecret(engine: "mihomo" | "sing-box") {
  const purpose = engine === "mihomo" ? "outpost:mihomo-controller:v1" : "outpost:sing-box-api:v1";
  return createHmac("sha256", config.hysteriaStatsSecret).update(purpose).digest("base64url");
}
