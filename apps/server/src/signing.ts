import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signed links for resources a browser loads directly (an <img>, a WebSocket),
 * where a bearer header cannot be sent. The signature binds user, path and expiry.
 */
export class Signer {
  private readonly key: Buffer;
  constructor(secret: string) {
    this.key = createHmac("sha256", secret).update("agent-v:signed-links:v1").digest();
  }

  private mac(userId: string, path: string, expires: number) {
    return createHmac("sha256", this.key)
      .update(`${userId}\n${path}\n${expires}`)
      .digest("base64url");
  }

  /** Query string for `path`, valid for `ttlSeconds`. */
  sign(userId: string, path: string, ttlSeconds: number) {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    return new URLSearchParams({
      u: userId,
      e: String(expires),
      s: this.mac(userId, path, expires),
    }).toString();
  }

  /** The user id the link was issued to, or null when invalid or expired. */
  verify(path: string, query: { u?: string; e?: string; s?: string }): string | null {
    const { u, e, s } = query;
    if (!u || !e || !s || !/^\d+$/.test(e)) return null;
    const expires = Number(e);
    if (expires < Date.now() / 1000) return null;
    const expected = Buffer.from(this.mac(u, path, expires));
    const given = Buffer.from(s);
    return expected.length === given.length && timingSafeEqual(expected, given) ? u : null;
  }
}
