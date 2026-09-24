import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "./errors.ts";

const version = "v1";

/**
 * AES-256-GCM for secrets at rest. The associated data binds each ciphertext to its owner and
 * purpose, so a value copied into another row does not decrypt.
 */
export class Vault {
  private readonly key: Buffer;
  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error("Vault key must be 32 bytes");
    this.key = key;
  }

  seal(plaintext: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`${version}:${context}`));
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [version, iv, cipher.getAuthTag(), data]
      .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
      .join(".");
  }

  open(sealed: string, context: string): string {
    const [v, iv, tag, data] = sealed.split(".");
    if (v !== version || !iv || !tag || data === undefined)
      throw new AppError("Stored credential is unreadable", 500);
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(`${version}:${context}`));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(data, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new AppError("Stored credential could not be decrypted. Reconnect the account.", 500);
    }
  }
}
