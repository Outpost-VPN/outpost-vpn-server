import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createToken, decryptSecret, deriveToken, encryptSecret, hashToken, tokensEqual } from "../src/server/security";

describe("secret storage", () => {
  test("encrypts and authenticates JSON values", () => {
    const key = randomBytes(32);
    const value = { password: "not-in-plaintext", nested: [1, 2, 3] };
    const box = encryptSecret(value, key);
    expect(JSON.stringify(box)).not.toContain(value.password);
    expect(decryptSecret<typeof value>(box, key)).toEqual(value);
  });

  test("rejects ciphertext changes", () => {
    const key = randomBytes(32);
    const box = encryptSecret({ password: "secret" }, key);
    const bytes = Buffer.from(box.ciphertext, "base64url");
    bytes[0] = bytes[0]! ^ 1;
    expect(() => decryptSecret({ ...box, ciphertext: bytes.toString("base64url") }, key)).toThrow();
  });

  test("stores tokens as comparable hashes", () => {
    const token = createToken();
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(tokensEqual(token, hash)).toBeTrue();
    expect(tokensEqual(`${token}x`, hash)).toBeFalse();
  });

  test("derives a stable subscription token without storing it", () => {
    const key = Buffer.alloc(32, 7);
    expect(deriveToken("subscription", "device", key)).toBe(deriveToken("subscription", "device", key));
    expect(deriveToken("subscription", "other", key)).not.toBe(deriveToken("subscription", "device", key));
  });
});
