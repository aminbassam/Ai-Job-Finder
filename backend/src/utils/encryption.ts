/**
 * AES-256-GCM symmetric encryption for sensitive values (API keys).
 * Requires ENCRYPTION_KEY env var: 64 hex chars (32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error("ENCRYPTION_KEY environment variable is not set.");
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== KEY_LENGTH) {
    throw new Error("ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).");
  }
  return buf;
}

export interface EncryptedPayload {
  encrypted: string; // hex
  iv:        string; // hex
  tag:       string; // hex
}

export function encrypt(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    encrypted: enc.toString("hex"),
    iv:        iv.toString("hex"),
    tag:       cipher.getAuthTag().toString("hex"),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.encrypted, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
