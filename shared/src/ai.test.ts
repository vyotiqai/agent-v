import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseAddKey,
  parseBaseUrl,
  parseChooseModels,
  parseLimit,
  parseSearchKey,
  parseTimeZone,
} from './ai.ts';

test('a key is accepted for a built-in provider, trimmed, and only as visible characters', () => {
  assert.deepEqual(parseAddKey({ provider: 'anthropic', key: '  sk-ant-api03-abcdefgh\n' }), {
    provider: 'anthropic',
    key: 'sk-ant-api03-abcdefgh',
  });
  for (const bad of [
    null,
    { provider: 'anthropic' },
    { provider: 'azure', key: 'sk-abcdefgh' },
    { provider: 'openai', key: 'short' },
    { provider: 'openai', key: 'sk-abc defgh' },
    { provider: 'openai', key: 'sk-abcdéfgh' },
    { provider: 'openai', key: 'x'.repeat(501) },
    // Only another provider takes an address and a model.
    { provider: 'openai', key: 'sk-abcdefgh', baseUrl: 'https://api.openai.com/v1' },
  ]) {
    assert.equal(parseAddKey(bad), null, JSON.stringify(bad));
  }
});

test('another provider needs an https address and a model', () => {
  assert.deepEqual(
    parseAddKey({
      provider: 'compatible',
      key: 'sk-or-v1-abcdefgh',
      baseUrl: 'https://openrouter.ai/api/v1/',
      model: ' openai/gpt-6-luna ',
    }),
    {
      provider: 'compatible',
      key: 'sk-or-v1-abcdefgh',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-6-luna',
    },
  );
  assert.equal(parseAddKey({ provider: 'compatible', key: 'sk-abcdefgh', model: 'm' }), null);
  assert.equal(
    parseAddKey({ provider: 'compatible', key: 'sk-abcdefgh', baseUrl: 'https://x.test' }),
    null,
  );
  for (const bad of [
    'http://openrouter.ai/api/v1',
    'https://me:pw@x.test/v1',
    'https://x.test/v1?key=1',
    'https://x.test/v1#a',
    'ftp://x.test',
    'not a url',
    7,
  ]) {
    assert.equal(parseBaseUrl(bad), null, String(bad));
  }
});

test('choosing models needs a key id and a model for jobs and for quick steps', () => {
  const choice = { keyId: '0192f1f3-7b8c-7d4e-9f00-123456789abc', model: 'claude-sonnet-5' };
  assert.deepEqual(parseChooseModels({ jobs: choice, quick: choice }), {
    jobs: choice,
    quick: choice,
  });
  assert.equal(parseChooseModels({ jobs: choice }), null);
  assert.equal(parseChooseModels({ jobs: { ...choice, keyId: 'x' }, quick: choice }), null);
});

test('a monthly limit is whole cents from $1 to $1,000', () => {
  assert.deepEqual(parseLimit({ monthlyLimitCents: 2000 }), { monthlyLimitCents: 2000 });
  for (const bad of [99, 100_001, 20.5, '2000', null]) {
    assert.equal(parseLimit({ monthlyLimitCents: bad }), null, String(bad));
  }
});

test('a search key and a time zone are accepted in their shapes', () => {
  assert.deepEqual(parseSearchKey({ key: ' BSAabcdefgh ' }), { key: 'BSAabcdefgh' });
  assert.equal(parseSearchKey({ key: 'short' }), null);
  assert.deepEqual(parseTimeZone({ timeZone: 'Europe/London' }), { timeZone: 'Europe/London' });
  assert.deepEqual(
    parseTimeZone({ timeZone: 'America/Argentina/Buenos_Aires' })?.timeZone,
    'America/Argentina/Buenos_Aires',
  );
  assert.equal(parseTimeZone({ timeZone: '../etc' }), null);
  assert.equal(parseTimeZone({ timeZone: '' }), null);
});
