/**
 * Your AI (stage 6, section 5; slice 2): the person's AI keys, the models they chose, their
 * monthly limit and their search key. Every request and response the app and the API exchange
 * about them is defined here, once, with the checks the API applies to what arrives.
 *
 * A key is sent once, when it is added, and never comes back: the app only ever sees its last
 * four characters.
 */

export type AiProvider = 'anthropic' | 'openai' | 'google' | 'compatible';

/** How a key stands since it was last used or checked. */
export type KeyStatus = 'working' | 'declined' | 'no-credit';

/** Why a key couldn't be added or checked: the provider's answer, in our own words. */
export type KeyProblem =
  | 'declined'
  | 'no-credit'
  | 'rate-limited'
  | 'model-gone'
  | 'provider-down'
  | 'unreachable'
  | 'address-not-allowed'
  | 'bad-request';

export interface AiModel {
  id: string;
  name: string;
  /** Whether it can call tools, which jobs need; null when the provider doesn't say. */
  tools: boolean | null;
  /** What Choose models recommends it for, when it does. */
  role: 'jobs' | 'jobs-more' | 'quick' | null;
  /** The words shown under it, such as "Recommended · capable and fast". */
  hint: string | null;
  /** US dollars per million tokens, when the price is known. */
  price: { input: number; output: number } | null;
}

export interface AiKey {
  id: string;
  provider: AiProvider;
  /** The provider's name, or a custom endpoint's host. */
  name: string;
  baseUrl: string | null;
  /** The key's last four characters, the only part ever shown again. */
  keyHint: string;
  status: KeyStatus;
  checkedAt: string;
  models: AiModel[];
}

export interface ModelChoice {
  keyId: string;
  model: string;
}

export interface SearchKey {
  keyHint: string;
  status: KeyStatus;
  checkedAt: string;
}

/** GET /v1/ai, and the answer to every change below. */
export interface AiView {
  keys: AiKey[];
  jobs: ModelChoice | null;
  quick: ModelChoice | null;
  monthlyLimitCents: number;
  /** This month's estimated spend, in millionths of a dollar. */
  spentThisMonthMicros: number;
  /** When the month ends and the spend starts again, in the person's time zone. */
  monthEndsAt: string;
  search: SearchKey | null;
}

/**
 * POST /v1/ai/keys: adds a key, or replaces the key for the same provider (and address). The
 * key is tested with a real call first and kept only if it works.
 */
export interface AddKeyRequest {
  provider: AiProvider;
  key: string;
  /** For another provider: its address (https) and the model to test with. */
  baseUrl?: string;
  model?: string;
}

/** 422 from adding or checking a key. */
export interface KeyRefused {
  error: 'key-refused';
  problem: KeyProblem;
}

/** PUT /v1/ai/models */
export interface ChooseModelsRequest {
  jobs: ModelChoice;
  quick: ModelChoice;
}

/** PUT /v1/ai/limit */
export interface LimitRequest {
  monthlyLimitCents: number;
}

/** PUT /v1/ai/search-key: a Brave Search key, tested with a real search first. */
export interface SearchKeyRequest {
  key: string;
}

/** GET /v1/me: who is signed in, for the top of You. */
export interface Me {
  name: string;
  email: string | null;
  timeZone: string;
}

/** PUT /v1/me/time-zone: the phone's time zone, which says when the person's month begins. */
export interface TimeZoneRequest {
  timeZone: string;
}

/** The limit can be set from $1 to $1,000 a month. */
export const LIMIT_CENTS = { min: 100, max: 100_000, default: 2000 } as const;

// ---------------------------------------------------------------- checks

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const PROVIDERS: readonly AiProvider[] = ['anthropic', 'openai', 'google', 'compatible'];

/** A key as pasted: surrounding space and line breaks are dropped; the rest is visible ASCII. */
const KEY = /^[\x21-\x7e]{8,500}$/;

/** A model id: visible ASCII, one line. */
const MODEL_ID = /^[\x21-\x7e]{1,200}$/;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** An https address with no user name, password, query or fragment, without a trailing "/". */
export function parseBaseUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 300) return null;
  let url: URL;
  try {
    url = new URL(v.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    return null;
  }
  return url.href.replace(/\/+$/, '');
}

export function parseAddKey(v: unknown): AddKeyRequest | null {
  if (!isObj(v)) return null;
  const { provider, key } = v;
  if (typeof provider !== 'string' || !PROVIDERS.includes(provider as AiProvider)) return null;
  const trimmed = typeof key === 'string' ? key.trim() : '';
  if (!KEY.test(trimmed)) return null;
  if (provider !== 'compatible') {
    if (v['baseUrl'] !== undefined || v['model'] !== undefined) return null;
    return { provider: provider as AiProvider, key: trimmed };
  }
  const baseUrl = parseBaseUrl(v['baseUrl']);
  const model = typeof v['model'] === 'string' ? v['model'].trim() : '';
  if (!baseUrl || !MODEL_ID.test(model)) return null;
  return { provider: 'compatible', key: trimmed, baseUrl, model };
}

function parseChoice(v: unknown): ModelChoice | null {
  if (!isObj(v)) return null;
  const { keyId, model } = v;
  if (typeof keyId !== 'string' || !ID.test(keyId)) return null;
  if (typeof model !== 'string' || !MODEL_ID.test(model)) return null;
  return { keyId, model };
}

export function parseChooseModels(v: unknown): ChooseModelsRequest | null {
  if (!isObj(v)) return null;
  const jobs = parseChoice(v['jobs']);
  const quick = parseChoice(v['quick']);
  return jobs && quick ? { jobs, quick } : null;
}

export function parseLimit(v: unknown): LimitRequest | null {
  if (!isObj(v)) return null;
  const cents = v['monthlyLimitCents'];
  if (!Number.isInteger(cents)) return null;
  const n = cents as number;
  return n >= LIMIT_CENTS.min && n <= LIMIT_CENTS.max ? { monthlyLimitCents: n } : null;
}

export function parseSearchKey(v: unknown): SearchKeyRequest | null {
  if (!isObj(v)) return null;
  const key = typeof v['key'] === 'string' ? v['key'].trim() : '';
  return KEY.test(key) ? { key } : null;
}

/** An IANA time zone name, in shape; the API also checks that it exists. */
export function parseTimeZone(v: unknown): TimeZoneRequest | null {
  if (!isObj(v)) return null;
  const tz = v['timeZone'];
  return typeof tz === 'string' && /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(tz)
    ? { timeZone: tz }
    : null;
}
