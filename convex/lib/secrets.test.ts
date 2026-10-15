import { describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, importSecretKey } from "./secrets";

const newKey = () => importSecretKey(randomBytes(32).toString("base64"));

describe("secrets", () => {
  it("decrypts what it encrypted, for the same binding only", async () => {
    const key = await newKey();
    const secret = await encryptSecret(key, "the-token", "site:a netbox");

    expect(secret.ciphertext).not.toContain("the-token");
    expect(await decryptSecret([key], secret, "site:a netbox")).toBe(
      "the-token",
    );
    await expect(
      decryptSecret([key], secret, "site:b netbox"),
    ).rejects.toThrow();
  });

  it("decrypts with the previous key during a rotation, and not without it", async () => {
    const previous = await newKey();
    const current = await newKey();
    const secret = await encryptSecret(previous, "the-token", "binding");

    expect(secret.keyId).toBe(previous.id);
    expect(await decryptSecret([current, previous], secret, "binding")).toBe(
      "the-token",
    );
    await expect(decryptSecret([current], secret, "binding")).rejects.toThrow();
  });

  it("refuses a key that is not 32 bytes of base64", async () => {
    await expect(
      importSecretKey(randomBytes(16).toString("base64")),
    ).rejects.toThrow();
    await expect(importSecretKey("not base64!")).rejects.toThrow();
  });

  it("detects an altered ciphertext", async () => {
    const key = await newKey();
    const secret = await encryptSecret(key, "the-token", "binding");
    const altered = {
      ...secret,
      ciphertext: secret.ciphertext.replace(/^./, (c) =>
        c === "A" ? "B" : "A",
      ),
    };
    await expect(decryptSecret([key], altered, "binding")).rejects.toThrow();
  });
});
