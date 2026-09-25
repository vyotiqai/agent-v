import { CATALOG } from '../src/ai/catalog.ts';

/**
 * Checks the catalog's prices against the figures OpenRouter publishes for the same models
 * (its public model list, which carries each provider's own per-token prices), and prints the
 * current OpenAI, Google and Anthropic models with theirs, so new ones can be added from a
 * checked source. Exits non-zero when a catalog price differs.
 *
 * Run in the Providers check: node live/prices.ts
 */

interface Listed {
  id: string;
  pricing?: Record<string, string>;
  context_length?: number;
  supported_parameters?: string[];
}

const res = await fetch('https://openrouter.ai/api/v1/models', {
  signal: AbortSignal.timeout(20_000),
});
if (!res.ok) throw new Error(`OpenRouter's model list answered ${res.status}.`);
const listed = ((await res.json()) as { data: Listed[] }).data;

const say = (line: string) => process.stdout.write(`${line}\n`);

const perMillion = (perToken: string | undefined) =>
  perToken === undefined ? undefined : Math.round(Number(perToken) * 1e6 * 1e4) / 1e4;

const prefix = { anthropic: 'anthropic/', openai: 'openai/', google: 'google/' } as const;

// OpenRouter names Claude models with dots ("claude-sonnet-5", "claude-haiku-4.5").
const openRouterId = (provider: keyof typeof prefix, id: string) =>
  prefix[provider] + (provider === 'anthropic' ? id.replace(/-(\d+)-(\d+)$/, '-$1.$2') : id);

let differences = 0;
for (const m of CATALOG) {
  const provider = m.provider;
  if (provider === 'compatible') continue;
  const entry = listed.find((l) => l.id === openRouterId(provider, m.id));
  if (!entry) {
    say(`? ${m.provider} ${m.id}: not in OpenRouter's list, not checked`);
    continue;
  }
  const published = {
    input: perMillion(entry.pricing?.['prompt']),
    output: perMillion(entry.pricing?.['completion']),
    cacheRead: perMillion(entry.pricing?.['input_cache_read']),
    cacheWrite: perMillion(entry.pricing?.['input_cache_write']),
  };
  for (const k of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
    const theirs = published[k];
    if (theirs === undefined) continue;
    if (theirs !== m.price[k]) {
      differences++;
      say(`✖ ${m.provider} ${m.id} ${k}: ours ${m.price[k]}, published ${theirs}`);
    }
  }
  say(`✔ ${m.provider} ${m.id} checked`);
}

say(
  '\nCurrent models with tools, dollars per million tokens (input / output / cache read / cache write):',
);
for (const l of listed) {
  if (!/^(openai|google|anthropic)\//.test(l.id) || !l.supported_parameters?.includes('tools'))
    continue;
  const p = l.pricing ?? {};
  say(
    `  ${l.id}: ${perMillion(p['prompt'])} / ${perMillion(p['completion'])} / ${perMillion(p['input_cache_read']) ?? '-'} / ${perMillion(p['input_cache_write']) ?? '-'} · context ${l.context_length ?? '?'}`,
  );
}

if (differences > 0) {
  say(`\n${differences} catalog price(s) differ from the published figures.`);
  process.exitCode = 1;
}
