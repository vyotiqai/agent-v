import type { Provider, Usage } from './types.ts';

/**
 * The models we know (stage 6, section 5): the ones Choose models recommends, what each is good
 * for, and its price, so a job can show what it cost. Any other model a provider lists can still
 * be picked; it shows usage without a cost.
 *
 * Prices are US dollars per million tokens, as each provider publishes them, and are checked
 * against the providers' published figures by the Providers check (live/prices.ts). `checked`
 * is the date they were last confirmed.
 */

export interface Price {
  input: number;
  output: number;
  /** Reading input back from the provider's cache. */
  cacheRead: number;
  /** Writing input to the cache (Anthropic's five-minute cache); 0 where writing costs nothing extra. */
  cacheWrite: number;
}

export interface KnownModel {
  provider: Provider;
  id: string;
  name: string;
  /** What Choose models recommends it for, and the words it shows. */
  role: 'jobs' | 'jobs-more' | 'quick';
  hint: string;
  price: Price;
  checked: string;
}

export const CATALOG: readonly KnownModel[] = [
  {
    provider: 'anthropic',
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    role: 'jobs',
    hint: 'Recommended · capable and fast',
    price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    checked: '2026-09-25',
  },
  {
    provider: 'anthropic',
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    role: 'jobs-more',
    hint: 'Most capable · costs more',
    price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
    checked: '2026-09-25',
  },
  {
    provider: 'anthropic',
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    role: 'quick',
    hint: 'Recommended · fastest and cheapest',
    price: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    checked: '2026-09-25',
  },
  {
    provider: 'openai',
    id: 'gpt-6-sol',
    name: 'GPT-6 Sol',
    role: 'jobs',
    hint: 'Recommended · capable and fast',
    price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    checked: '2026-09-25',
  },
  {
    provider: 'openai',
    id: 'gpt-6-astra',
    name: 'GPT-6 Astra',
    role: 'jobs-more',
    hint: 'Most capable · costs more',
    price: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    checked: '2026-09-25',
  },
  {
    provider: 'openai',
    id: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    role: 'quick',
    hint: 'Recommended · fastest and cheapest',
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    checked: '2026-09-25',
  },
  // Google's Pro model is still a preview, which Google may withdraw at short notice, so Flash
  // is the one recommended for jobs. Gemini 3.8 Flash's price is introductory until the end of
  // 2026; the nightly check says when it changes.
  {
    provider: 'google',
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    role: 'jobs',
    hint: 'Recommended · capable and fast',
    price: { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0.0417 },
    checked: '2026-09-25',
  },
  {
    provider: 'google',
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    role: 'quick',
    hint: 'Recommended · fastest and cheapest',
    price: { input: 0.25, output: 1.5, cacheRead: 0.025, cacheWrite: 0.0833 },
    checked: '2026-09-25',
  },
];

/** The model a provider's catalog entries recommend for a role, if it has one. */
export function recommended(provider: Provider, role: KnownModel['role']): KnownModel | undefined {
  return CATALOG.find((m) => m.provider === provider && m.role === role);
}

export function known(provider: Provider, id: string): KnownModel | undefined {
  return CATALOG.find((m) => m.provider === provider && m.id === id);
}

/**
 * What a call cost, in millionths of a dollar (whole numbers, so sums never drift), or null
 * when the model's price or the call's usage isn't known.
 */
export function costMicros(price: Price | undefined, usage: Usage | null): number | null {
  if (!price || !usage) return null;
  const fresh = Math.max(0, usage.input - usage.cachedInput - usage.cacheWrite);
  // Tokens × dollars per million tokens = millionths of a dollar.
  return Math.round(
    fresh * price.input +
      usage.cachedInput * price.cacheRead +
      usage.cacheWrite * price.cacheWrite +
      usage.output * price.output,
  );
}
