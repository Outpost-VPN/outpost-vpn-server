import { createHash } from "node:crypto";

export async function verifiedDownload(url: string, checksum: string) {
  if (!/^[0-9a-f]{64}$/.test(checksum)) throw new Error("Expected a pinned SHA-256 checksum");
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== checksum) throw new Error(`SHA-256 mismatch: ${url}`);
  return bytes;
}
