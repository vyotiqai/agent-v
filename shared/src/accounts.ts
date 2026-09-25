/**
 * Accounts: signing in, sessions and phones (stage 6, section 3; slice 1). Every request and
 * response the app and the API exchange about accounts is defined here, once, with the checks the
 * API applies to what arrives.
 */

export type Platform = 'android' | 'ios';

/** The phone signing in: shown in the phones list, and its signing key for Spend and Can't undo. */
export interface PhoneInfo {
  platform: Platform;
  /** What the phone calls itself, such as "Pixel 8". */
  model: string;
  /** The public half of the phone's signing key: a P-256 key, SPKI DER, in base64. */
  signingKey: string;
}

/** POST /v1/auth/nonce: a one-time value the sign-in must carry, so a token can't be replayed. */
export interface NonceResponse {
  nonce: string;
}

/** POST /v1/auth/google */
export interface GoogleSignInRequest {
  idToken: string;
  nonce: string;
  phone: PhoneInfo;
}

/** The answer to signing in and to refreshing. */
export interface Session {
  /** Sent with every request; lasts 15 minutes. */
  accessToken: string;
  accessExpiresAt: string;
  /** Kept only in the phone's secure store; used once, then replaced. */
  refreshToken: string;
  personId: string;
  phoneId: string;
}

/** POST /v1/auth/refresh */
export interface RefreshRequest {
  refreshToken: string;
}

/** One phone signed in to the account (D137). */
export interface Phone {
  id: string;
  platform: Platform;
  model: string;
  signedInAt: string;
  lastUsedAt: string;
  /** The phone asking. */
  current: boolean;
}

/** GET /v1/phones */
export interface PhonesResponse {
  phones: Phone[];
}

/** What went wrong, as a kind the app turns into words. */
export type ApiErrorCode =
  | 'bad-request'
  | 'unauthorized'
  | 'sign-in-failed'
  | 'signed-out'
  | 'not-found'
  | 'method-not-allowed'
  | 'too-many-requests'
  /** A key the provider refused (Your AI): the answer says why. */
  | 'key-refused'
  | 'internal';

export interface ApiError {
  error: ApiErrorCode;
}

// ---------------------------------------------------------------- checks

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** A phone's own name: printable, one line, at most 60 characters. */
const MODEL = /^[\p{L}\p{N}\p{P}\p{Zs}+]{1,60}$/u;

export function parsePhoneInfo(v: unknown): PhoneInfo | null {
  if (!isObj(v)) return null;
  const { platform, model, signingKey } = v;
  if (platform !== 'android' && platform !== 'ios') return null;
  if (typeof model !== 'string' || !MODEL.test(model.trim())) return null;
  if (!text(signingKey, 400) || !BASE64.test(signingKey)) return null;
  return { platform, model: model.trim(), signingKey };
}

export function parseGoogleSignIn(v: unknown): GoogleSignInRequest | null {
  if (!isObj(v)) return null;
  const { idToken, nonce } = v;
  if (!text(idToken, 4096) || !text(nonce, 100) || !BASE64URL.test(nonce)) return null;
  const phone = parsePhoneInfo(v['phone']);
  return phone ? { idToken, nonce, phone } : null;
}

export function parseRefresh(v: unknown): RefreshRequest | null {
  if (!isObj(v) || !text(v['refreshToken'], 100) || !BASE64URL.test(v['refreshToken'])) return null;
  return { refreshToken: v['refreshToken'] };
}
