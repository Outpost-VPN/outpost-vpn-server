import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config";

export type SecretBox = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function loadMasterKey(path = config.masterKeyPath): Buffer {
  if (!existsSync(path)) {
    writeFileSync(path, randomBytes(32), { mode: 0o600, flag: "wx" });
  }
  chmodSync(path, 0o600);
  const key = readFileSync(path);
  if (key.length !== 32) throw new Error("Мастер-ключ Matreshka должен быть длиной 32 байта");
  return key;
}

export function encryptSecret(value: unknown, key = loadMasterKey()): SecretBox {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptSecret<T>(box: SecretBox, key = loadMasterKey()): T {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(box.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function createToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function deriveToken(purpose: string, id: string, key = loadMasterKey()) {
  return createHmac("sha256", key).update(purpose, "utf8").update("\0").update(id, "utf8").digest("base64url");
}

export function tokensEqual(token: string, hash: string) {
  const calculated = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(hash, "hex");
  return calculated.length === expected.length && timingSafeEqual(calculated, expected);
}
