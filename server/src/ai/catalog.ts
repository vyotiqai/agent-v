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
];

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
