import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AiProvider, AiView } from '@agentv/shared/ai.ts';
import type { AiDeps } from '../src/ai/keys.ts';
import {
  type ModelInfo,
  type ProviderClient,
  ProviderError,
  type StreamEvent,
  type Usage,
} from '../src/ai/types.ts';
import { DataKeys } from '../src/crypto/envelope.ts';
import type { Logger } from '../src/log.ts';
import { type Api, withApi } from './harness.ts';
import { LocalWrapper, MemoryStore } from './stand-ins.ts';

// Your AI end to end through the API, on a real Postgres (slice 2): adding, checking, replacing
// and removing keys, choosing models, the monthly limit, the search key and the person's time
// zone. The provider is played by a stand-in at the client boundary, as Cloud KMS is by
// LocalWrapper: the clients themselves are checked against the real providers (server/live/) and
// their captured answers (src/ai/replay.test.ts).

/** How the stand-in provider answers, set by each test as it goes. */
interface Provider {
  models: ModelInfo[] | ProviderError;
  call: Usage | ProviderError;
  /** Every key and model the provider was called with. */
  seen: { key: string; model?: string }[];
}

const model = (id: string, tools: boolean | null = null): ModelInfo => ({
  id,
  name: id,
  tools,
  contextTokens: null,
  maxOutputTokens: null,
});

const provider = (): Provider => ({
  models: [model('claude-sonnet-5'), model('claude-haiku-4-5'), model('claude-opus-5-5')],
  call: { input: 20, cachedInput: 0, cacheWrite: 0, output: 2 },
  seen: [],
});

function standIn(state: Provider, name: AiProvider): ProviderClient {
  return {
    provider: name,
    async models(key) {
      state.seen.push({ key });
      if (state.models instanceof ProviderError) throw state.models;
      return state.models;
    },
    async *stream(key, call): AsyncGenerator<StreamEvent> {
      state.seen.push({ key, model: call.model });
      if (state.call instanceof ProviderError) throw state.call;
      yield {
        type: 'end',
        stop: 'max-tokens',
        usage: state.call,
        turn: { role: 'model', provider: name, model: call.model, parts: [], native: [] },
      };
    },
  };
}

interface Setup {
  providers: Record<string, Provider>;
  search: { answer: 'ok' | ProviderError; keys: string[] };
}

function run(fn: (api: Api, setup: Setup) => Promise<void>): Promise<void> {
  const setup: Setup = { providers: {}, search: { answer: 'ok', keys: [] } };
  const ai = (logger: Logger): Omit<AiDeps, 'sql' | 'logger'> => ({
    dataKeys: new DataKeys(new LocalWrapper(), new MemoryStore(), logger),
    client: (name, baseUrl) => {
      const label = baseUrl ?? name;
      setup.providers[label] ??= provider();
      return standIn(setup.providers[label], name);
    },
    search: async (key) => {
      setup.search.keys.push(key);
      if (setup.search.answer instanceof ProviderError) throw setup.search.answer;
      return [];
    },
  });
  return withApi((api) => fn(api, setup), { ai });
}

const KEY = 'sk-ant-api03-first-key-9Qx2';

test('a key that works is kept sealed, with the recommended models chosen and its test call counted', async () => {
  await run(async ({ call, signIn, sql, logs }, { providers }) => {
    const { accessToken } = await signIn();
    const added = await call(
      'POST',
      '/v1/ai/keys',
      { provider: 'anthropic', key: KEY },
      accessToken,
    );
    assert.equal(added.status, 200, JSON.stringify(added.json));
    const view = added.json as AiView;
    const [key] = view.keys;
    assert.ok(key);
    assert.equal(key.name, 'Anthropic');
    assert.equal(key.keyHint, '9Qx2');
    assert.equal(key.status, 'working');
    assert.deepEqual(
      key.models.map((m) => [m.id, m.role, m.tools]),
      [
        ['claude-sonnet-5', 'jobs', true],
        ['claude-haiku-4-5', 'quick', true],
        ['claude-opus-5-5', 'jobs-more', true],
      ],
    );
    assert.deepEqual(view.jobs, { keyId: key.id, model: 'claude-sonnet-5' });
    assert.deepEqual(view.quick, { keyId: key.id, model: 'claude-haiku-4-5' });
    assert.equal(view.monthlyLimitCents, 2000);
    // The test call went to the cheapest model; 20 tokens in at $1 and 2 out at $5 a million.
    assert.deepEqual(providers['anthropic']?.seen.at(-1), { key: KEY, model: 'claude-haiku-4-5' });
    assert.equal(view.spentThisMonthMicros, 20 * 1 + 2 * 5);

    // The key exists only sealed; not in the database as it is, nor in any log line.
    const [row] = await sql`select key_sealed, key_hint from ai_keys`;
    assert.ok(!Buffer.from(row?.['key_sealed']).includes(Buffer.from(KEY)));
    assert.ok(logs.every((l) => !l.includes(KEY) && !l.includes('first-key')));
    assert.ok(logs.some((l) => l.includes('"message":"ai.key-saved"')));
    assert.ok(!JSON.stringify(view).includes(KEY));
  });
});

test('a key the provider refuses is not kept, and says why', async () => {
  await run(async ({ call, signIn, sql }, { providers }) => {
    const { accessToken } = await signIn();
    const cases = [
      [new ProviderError('declined', { status: 401 }), 'models', 'declined'],
      [new ProviderError('no-credit', { status: 400 }), 'call', 'no-credit'],
      [new ProviderError('unreachable'), 'models', 'unreachable'],
    ] as const;
    for (const [err, where, problem] of cases) {
      const state = provider();
      if (where === 'models') state.models = err;
      else state.call = err;
      providers['openai'] = state;
      const r = await call(
        'POST',
        '/v1/ai/keys',
        { provider: 'openai', key: 'sk-proj-abcdefgh' },
        accessToken,
      );
      assert.deepEqual([r.status, r.json], [422, { error: 'key-refused', problem }]);
    }
    const [{ count }] = (await sql`select count(*)::int from ai_keys`) as unknown as [
      { count: number },
    ];
    assert.equal(count, 0);
  });
});

test('replacing a key keeps its place; checking it again uses the new one and records its standing', async () => {
  await run(async ({ call, signIn }, { providers }) => {
    const { accessToken } = await signIn();
    const first = (
      await call('POST', '/v1/ai/keys', { provider: 'anthropic', key: KEY }, accessToken)
    ).json as AiView;
    const replaced = (
      await call(
        'POST',
        '/v1/ai/keys',
        { provider: 'anthropic', key: 'sk-ant-api03-second-key-7Tp1' },
        accessToken,
      )
    ).json as AiView;
    assert.equal(replaced.keys.length, 1);
    assert.equal(replaced.keys[0]?.id, first.keys[0]?.id);
    assert.equal(replaced.keys[0]?.keyHint, '7Tp1');
    const id = replaced.keys[0]?.id as string;

    const state = providers['anthropic'] as Provider;
    state.call = new ProviderError('no-credit');
    const check = await call('POST', `/v1/ai/keys/${id}/check`, {}, accessToken);
    assert.deepEqual(
      [check.status, check.json],
      [422, { error: 'key-refused', problem: 'no-credit' }],
    );
    assert.equal(state.seen.at(-1)?.key, 'sk-ant-api03-second-key-7Tp1');
    // Checked with a model the key is used for.
    assert.equal(state.seen.at(-1)?.model, 'claude-sonnet-5');
    const view = (await call('GET', '/v1/ai', undefined, accessToken)).json as AiView;
    assert.equal(view.keys[0]?.status, 'no-credit');

    // A provider that can't be reached says nothing about the key itself.
    state.call = new ProviderError('unreachable');
    await call('POST', `/v1/ai/keys/${id}/check`, {}, accessToken);
    assert.equal(
      ((await call('GET', '/v1/ai', undefined, accessToken)).json as AiView).keys[0]?.status,
      'no-credit',
    );

    state.call = { input: 10, cachedInput: 0, cacheWrite: 0, output: 1 };
    const works = await call('POST', `/v1/ai/keys/${id}/check`, {}, accessToken);
    assert.equal(works.status, 200);
    assert.equal((works.json as AiView).keys[0]?.status, 'working');
  });
});

test('another provider needs its address and a model; a server without a model list is still usable', async () => {
  await run(async ({ call, signIn }, { providers }) => {
    const { accessToken } = await signIn();
    const base = 'https://openrouter.ai/api/v1';
    providers[base] = {
      ...provider(),
      models: [model('openai/gpt-6-luna', true), model('meta/llama-x', false)],
    };
    const bad = await call(
      'POST',
      '/v1/ai/keys',
      { provider: 'compatible', key: 'sk-or-v1-abcdefgh' },
      accessToken,
    );
    assert.equal(bad.status, 400);
    const insecure = await call(
      'POST',
      '/v1/ai/keys',
      {
        provider: 'compatible',
        key: 'sk-or-v1-abcdefgh',
        baseUrl: 'http://openrouter.ai/api/v1',
        model: 'x',
      },
      accessToken,
    );
    assert.equal(insecure.status, 400);
    const missing = await call(
      'POST',
      '/v1/ai/keys',
      { provider: 'compatible', key: 'sk-or-v1-abcdefgh', baseUrl: base, model: 'not/listed' },
      accessToken,
    );
    assert.deepEqual(missing.json, { error: 'key-refused', problem: 'model-gone' });

    const added = await call(
      'POST',
      '/v1/ai/keys',
      {
        provider: 'compatible',
        key: 'sk-or-v1-abcdefgh',
        baseUrl: `${base}/`,
        model: 'openai/gpt-6-luna',
      },
      accessToken,
    );
    assert.equal(added.status, 200, JSON.stringify(added.json));
    const view = added.json as AiView;
    assert.equal(view.keys[0]?.name, 'openrouter.ai');
    assert.equal(view.keys[0]?.baseUrl, base);
    assert.deepEqual(view.jobs?.model, 'openai/gpt-6-luna');
    assert.deepEqual(view.quick?.model, 'openai/gpt-6-luna');

    // A self-hosted server that doesn't list its models: the named model is the list.
    const own = 'https://llm.example.com/v1';
    providers[own] = { ...provider(), models: new ProviderError('model-gone', { status: 404 }) };
    const self = await call(
      'POST',
      '/v1/ai/keys',
      { provider: 'compatible', key: 'local-key-abcdefgh', baseUrl: own, model: 'qwen-x' },
      accessToken,
    );
    assert.equal(self.status, 200);
    assert.deepEqual(
      (self.json as AiView).keys[1]?.models.map((m) => m.id),
      ['qwen-x'],
    );
  });
});

test('models are chosen from the person’s own keys, and one that can’t use tools can’t run jobs', async () => {
  await run(async ({ call, signIn }, { providers }) => {
    const maya = await signIn('110248495921238986420');
    const sam = await signIn('998877665544332211000');
    const base = 'https://openrouter.ai/api/v1';
    providers[base] = { ...provider(), models: [model('good', true), model('no-tools', false)] };
    const mine = (
      await call(
        'POST',
        '/v1/ai/keys',
        { provider: 'compatible', key: 'sk-or-v1-abcdefgh', baseUrl: base, model: 'good' },
        maya.accessToken,
      )
    ).json as AiView;
    const keyId = mine.keys[0]?.id as string;

    const choose = (jobs: string, quick: string, token = maya.accessToken, id = keyId) =>
      call(
        'PUT',
        '/v1/ai/models',
        { jobs: { keyId: id, model: jobs }, quick: { keyId: id, model: quick } },
        token,
      );
    assert.equal((await choose('no-tools', 'good')).status, 400);
    assert.equal((await choose('missing', 'good')).status, 400);
    const ok = await choose('good', 'no-tools');
    assert.equal(ok.status, 200);
    assert.deepEqual((ok.json as AiView).quick, { keyId, model: 'no-tools' });
    // Someone else's key is not theirs to choose, nor to see, check or remove.
    assert.equal((await choose('good', 'good', sam.accessToken)).status, 400);
    assert.deepEqual(
      ((await call('GET', '/v1/ai', undefined, sam.accessToken)).json as AiView).keys,
      [],
    );
    assert.equal(
      (await call('POST', `/v1/ai/keys/${keyId}/check`, {}, sam.accessToken)).status,
      404,
    );
    assert.equal(
      (await call('DELETE', `/v1/ai/keys/${keyId}`, undefined, sam.accessToken)).status,
      404,
    );
  });
});

test('removing a key deletes it at once and unsets the models chosen from it', async () => {
  await run(async ({ call, signIn, sql }) => {
    const { accessToken } = await signIn();
    const view = (
      await call('POST', '/v1/ai/keys', { provider: 'anthropic', key: KEY }, accessToken)
    ).json as AiView;
    const removed = await call('DELETE', `/v1/ai/keys/${view.keys[0]?.id}`, undefined, accessToken);
    assert.equal(removed.status, 200);
    assert.deepEqual((removed.json as AiView).keys, []);
    assert.equal((removed.json as AiView).jobs, null);
    assert.equal((removed.json as AiView).quick, null);
    assert.equal((await sql`select 1 from ai_keys`).length, 0);
    assert.equal(
      (await call('DELETE', `/v1/ai/keys/${view.keys[0]?.id}`, undefined, accessToken)).status,
      404,
    );
  });
});

test('the monthly limit, the month in the person’s time zone, and who is signed in', async () => {
  await run(async ({ call, signIn }) => {
    const { accessToken } = await signIn();
    assert.deepEqual((await call('GET', '/v1/me', undefined, accessToken)).json, {
      name: 'Maya Rao',
      email: 'maya@example.com',
      timeZone: 'UTC',
    });
    const set = await call('PUT', '/v1/ai/limit', { monthlyLimitCents: 5000 }, accessToken);
    assert.equal((set.json as AiView).monthlyLimitCents, 5000);
    assert.equal(
      (await call('PUT', '/v1/ai/limit', { monthlyLimitCents: 50 }, accessToken)).status,
      400,
    );

    assert.equal(
      (await call('PUT', '/v1/me/time-zone', { timeZone: 'Mars/Olympus' }, accessToken)).status,
      400,
    );
    assert.equal(
      (await call('PUT', '/v1/me/time-zone', { timeZone: 'Asia/Kolkata' }, accessToken)).status,
      204,
    );
    // The month ends at midnight on the 1st in Kolkata: 18:30 the day before, in UTC.
    const ends = new Date(
      ((await call('GET', '/v1/ai', undefined, accessToken)).json as AiView).monthEndsAt,
    );
    assert.equal(ends.getUTCHours() * 60 + ends.getUTCMinutes(), 18 * 60 + 30);
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(ends);
    assert.equal(local, '1, 00');
    assert.ok(ends.getTime() > Date.now());
  });
});

test('a Brave Search key is kept once a real search works with it', async () => {
  await run(async ({ call, signIn, sql }, { search }) => {
    const { accessToken } = await signIn();
    search.answer = new ProviderError('declined', { status: 422 });
    const refused = await call(
      'PUT',
      '/v1/ai/search-key',
      { key: 'BSA-first-key-abcd' },
      accessToken,
    );
    assert.deepEqual(
      [refused.status, refused.json],
      [422, { error: 'key-refused', problem: 'declined' }],
    );
    search.answer = 'ok';
    const kept = await call('PUT', '/v1/ai/search-key', { key: 'BSA-first-key-abcd' }, accessToken);
    assert.equal(kept.status, 200);
    assert.equal((kept.json as AiView).search?.keyHint, 'abcd');
    assert.deepEqual(search.keys, ['BSA-first-key-abcd', 'BSA-first-key-abcd']);
    const [row] = await sql`select key_sealed from search_keys`;
    assert.ok(!Buffer.from(row?.['key_sealed']).includes(Buffer.from('BSA-first-key-abcd')));
    const removed = await call('DELETE', '/v1/ai/search-key', undefined, accessToken);
    assert.equal((removed.json as AiView).search, null);
  });
});

test('Your AI needs a signed-in phone, and key checks are limited to 10 a minute', async () => {
  await run(async ({ call, signIn }, { providers }) => {
    assert.equal((await call('GET', '/v1/ai')).status, 401);
    const { accessToken } = await signIn();
    providers['anthropic'] = { ...provider(), models: new ProviderError('declined') };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (await call('POST', '/v1/ai/keys', { provider: 'anthropic', key: KEY }, accessToken))
          .status,
      );
    }
    assert.deepEqual(statuses, [...Array(10).fill(422), 429]);
  });
});
