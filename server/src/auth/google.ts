import type { KeyObject } from 'node:crypto';
import { checkClaims, checkSignature, importKeys, parse, TokenError } from './jwt.ts';

/**
 * Checks a Google identity token from the phone's own sign-in sheet (stage 6, section 3; D96):
 * its signature against Google's published keys, that Google issued it for Agent V, that it is
 * current, and that it carries the one-time nonce this sign-in started with. Our own code over
 * Google's standard endpoints (rule 6).
 */

export const GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;

export interface GoogleIdentity {
  /** Google's stable id for the person; the account is tied to this, never to the email. */
  sub: string;
  email: string | null;
  name: string | null;
}

/** Google's keys couldn't be had: not the person's fault, so not a failed sign-in. */
export class KeysUnavailable extends Error {}

export interface GoogleVerifierOptions {
  /** Agent V's server client id: the audience Google issues the token for. */
  audience: string;
  keysUrl?: string;
  issuers?: readonly string[];
  fetch?: typeof fetch;
  /** Milliseconds since 1970. */
  now?: () => number;
}

export type VerifyGoogle = (token: string, nonce: string) => Promise<GoogleIdentity>;

export function createGoogleVerifier(options: GoogleVerifierOptions): VerifyGoogle {
  const keysUrl = options.keysUrl ?? GOOGLE_KEYS_URL;
  const issuers = options.issuers ?? GOOGLE_ISSUERS;
  const get = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let keys = new Map<string, KeyObject>();
  let freshUntil = 0;
  let fetchedAt = -Infinity;

  // Google rotates its keys and says how long to keep them (Cache-Control max-age). A token
  // signed with a key we don't have yet makes us fetch again, at most once a minute.
  async function refresh(): Promise<void> {
    fetchedAt = now();
    let response: Response;
    try {
      response = await get(keysUrl, { signal: AbortSignal.timeout(5_000) });
    } catch {
      throw new KeysUnavailable();
    }
    if (!response.ok) throw new KeysUnavailable();
    keys = importKeys(await response.json());
    const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '');
    freshUntil = now() + (maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000);
  }

  async function keyFor(kid: string): Promise<KeyObject> {
    if (now() >= freshUntil) {
      try {
        await refresh();
      } catch (err) {
        if (keys.size === 0) throw err;
      }
    }
    let key = keys.get(kid);
    if (!key && now() - fetchedAt > 60_000) {
      await refresh();
      key = keys.get(kid);
    }
    if (!key) throw new TokenError('unknown key');
    return key;
  }

  return async (token, nonce) => {
    const { header, claims, signed, signature } = parse(token);
    const key = await keyFor(header.kid);
    if (!checkSignature(signed, signature, key)) throw new TokenError('signature');
    const sub = checkClaims(claims, {
      issuers,
      audience: options.audience,
      now: Math.floor(now() / 1000),
    });
    if (claims['nonce'] !== nonce) throw new TokenError('nonce');
    const email =
      typeof claims['email'] === 'string' && claims['email_verified'] === true
        ? claims['email']
        : null;
    const name = typeof claims['name'] === 'string' ? claims['name'].slice(0, 200) : null;
    return { sub, email, name };
  };
}
