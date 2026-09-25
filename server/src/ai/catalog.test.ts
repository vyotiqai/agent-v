import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, costMicros, known } from './catalog.ts';

test('a call’s cost counts fresh input, cache reads and writes, and output at their own prices', () => {
  const price = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
  // 10,000 input tokens, of which 6,000 read from the cache and 1,000 written to it; 500 out.
  const usage = { input: 10_000, cachedInput: 6_000, cacheWrite: 1_000, output: 500 };
  // 3,000 × $2 + 6,000 × $0.20 + 1,000 × $2.50 + 500 × $10, per million tokens.
  assert.equal(costMicros(price, usage), 6_000 + 1_200 + 2_500 + 5_000);
  assert.equal(costMicros(undefined, usage), null);
  assert.equal(costMicros(price, null), null);
});

test('the catalog recommends a model for jobs and one for quick steps from each provider it lists', () => {
  for (const provider of new Set(CATALOG.map((m) => m.provider))) {
    const roles = CATALOG.filter((m) => m.provider === provider).map((m) => m.role);
    assert.ok(roles.includes('jobs'), `${provider} has no model for jobs`);
    assert.ok(roles.includes('quick'), `${provider} has no model for quick steps`);
  }
  assert.equal(known('anthropic', 'claude-haiku-4-5')?.role, 'quick');
  assert.equal(new Set(CATALOG.map((m) => `${m.provider}/${m.id}`)).size, CATALOG.length);
});
