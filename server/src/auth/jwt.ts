import { createPublicKey, type JsonWebKey, type KeyObject, verify } from 'node:crypto';

/**
 * Just enough of JSON Web Tokens to check an identity token from Google (and, in slice 13, Apple),
 * with Node's own crypto (rule 6). Only RS256 is accepted: a token naming any other algorithm,
 * including "none", is refused before its signature is looked at.
 */

export interface JwtHeader {
  alg: string;
  kid: string;
}

export type Claims = Record<string, unknown>;

export class TokenError extends Error {}

const SEGMENT = /^[A-Za-z0-9_-]+$/;

function decodeJson(segment: string): Record<string, unknown> {
  const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TokenError('not an object');
  return value as Record<string, unknown>;
}

/** Splits a token into its header, claims and the signed part, without trusting any of it yet. */
export function parse(token: string): {
  header: JwtHeader;
  claims: Claims;
  signed: string;
  signature: Buffer;
} {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every((p) => SEGMENT.test(p))) throw new TokenError('malformed');
  const [h, c, s] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let claims: Claims;
  try {
    header = decodeJson(h);
    claims = decodeJson(c);
  } catch {
    throw new TokenError('malformed');
  }
  if (header['alg'] !== 'RS256') throw new TokenError('algorithm');
  if (typeof header['kid'] !== 'string' || header['kid'] === '') throw new TokenError('key id');
  return {
    header: { alg: 'RS256', kid: header['kid'] },
    claims,
    signed: `${h}.${c}`,
    signature: Buffer.from(s, 'base64url'),
  };
}

/** Imports the RSA keys of a JSON Web Key Set, by key id; keys of any other kind are skipped. */
export function importKeys(jwks: unknown): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>();
  const list = (jwks as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(list)) throw new TokenError('not a key set');
  for (const jwk of list as JsonWebKey[]) {
    if (jwk.kty !== 'RSA' || typeof jwk['kid'] !== 'string') continue;
    if (jwk['use'] !== undefined && jwk['use'] !== 'sig') continue;
    keys.set(jwk['kid'] as string, createPublicKey({ key: jwk, format: 'jwk' }));
  }
  return keys;
}

export function checkSignature(signed: string, signature: Buffer, key: KeyObject): boolean {
  return verify('RSA-SHA256', Buffer.from(signed), key, signature);
}

export interface Expected {
  issuers: readonly string[];
  audience: string;
  /** Seconds since 1970. */
  now: number;
  /** How far apart our clock and the issuer's may be, in seconds. */
  skew?: number;
}

/** Checks who issued the claims, for whom, and when. Returns the subject. */
export function checkClaims(claims: Claims, expected: Expected): string {
  const skew = expected.skew ?? 60;
  const { iss, aud, exp, iat, sub } = claims;
  if (typeof iss !== 'string' || !expected.issuers.includes(iss)) throw new TokenError('issuer');
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(expected.audience)) throw new TokenError('audience');
  if (typeof exp !== 'number' || exp + skew < expected.now) throw new TokenError('expired');
  if (typeof iat !== 'number' || iat - skew > expected.now)
    throw new TokenError('issued in the future');
  if (typeof claims['nbf'] === 'number' && claims['nbf'] - skew > expected.now) {
    throw new TokenError('not yet valid');
  }
  if (typeof sub !== 'string' || sub === '' || sub.length > 255) throw new TokenError('subject');
  return sub;
}
