// Integration tokens are stored encrypted with AES-256-GCM under the
// deployment's NETPLAN_SECRET_KEY (ADR 0023). The additional data binds a
// ciphertext to the integration it was entered for, so a copied ciphertext
// does not decrypt elsewhere. Every value is base64.

export type EncryptedSecret = {
  /** Which key encrypted it: the first bytes of the key's SHA-256. */
  keyId: string;
  iv: string;
  ciphertext: string;
};

export type SecretKey = { id: string; key: CryptoKey };

const IV_BYTES = 12;
const KEY_BYTES = 32;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const encoder = new TextEncoder();

/** Reads a key given as base64 of 32 random bytes. */
export async function importSecretKey(encoded: string): Promise<SecretKey> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64(encoded.trim());
  } catch {
    throw new Error("The secret key is not base64.");
  }
  if (raw.length !== KEY_BYTES) {
    throw new Error(`The secret key must be ${KEY_BYTES} bytes.`);
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  return {
    id: toBase64(digest.slice(0, 9)),
    key: await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]),
  };
}

export async function encryptSecret(
  key: SecretKey,
  plaintext: string,
  boundTo: string,
): Promise<EncryptedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(boundTo) },
    key.key,
    encoder.encode(plaintext),
  );
  return {
    keyId: key.id,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypts with whichever of `keys` encrypted the secret. Throws when none
 * did, or when the secret was bound to something else or altered.
 */
export async function decryptSecret(
  keys: Array<SecretKey>,
  secret: EncryptedSecret,
  boundTo: string,
): Promise<string> {
  const key = keys.find((candidate) => candidate.id === secret.keyId);
  if (!key) throw new Error("No configured key encrypted this secret.");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(secret.iv),
      additionalData: encoder.encode(boundTo),
    },
    key.key,
    fromBase64(secret.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * The deployment's keys: the current one encrypts, and the previous one
 * still decrypts during a rotation.
 */
export async function configuredKeys(): Promise<{
  current: SecretKey;
  all: Array<SecretKey>;
}> {
  const encoded = process.env.NETPLAN_SECRET_KEY;
  if (!encoded) throw new Error("NETPLAN_SECRET_KEY is not set.");
  const current = await importSecretKey(encoded);
  const previous = process.env.NETPLAN_SECRET_KEY_PREVIOUS;
  return {
    current,
    all: previous ? [current, await importSecretKey(previous)] : [current],
  };
}
