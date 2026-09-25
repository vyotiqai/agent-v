import assert from 'node:assert/strict';
import { anthropicClient } from '../src/ai/anthropic.ts';
import { compatibleClient } from '../src/ai/compatible.ts';
import { googleClient } from '../src/ai/google.ts';
import { openaiClient } from '../src/ai/openai.ts';
import {
  type ModelCall,
  type ProviderClient,
  ProviderError,
  type StreamEvent,
  type Turn,
} from '../src/ai/types.ts';
import type { Egress } from '../src/egress/client.ts';
import { braveSearch } from '../src/search/brave.ts';

/**
 * The checks each client passes against its real provider (./providers.test.ts), and again, in
 * every test run, against what the provider answered when they were captured
 * (../src/ai/replay.test.ts). One definition, so the two can't drift apart.
 */

export const SCENARIOS = ['declined', 'models', 'text', 'tools', 'model-gone'] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** Brave Search's checks: a declined key, and a real search. */
export const SEARCH_SCENARIOS = ['declined', 'search'] as const;
export type SearchScenario = (typeof SEARCH_SCENARIOS)[number];

/** A key no provider accepts, for the declined check; it needs no real key. */
export const NOT_A_KEY = 'agent-v-not-a-real-key';

/** The client for a provider label: anthropic, openai, google, or compatible-<host>. */
export function clientFor(label: string, egress: Egress, baseUrl?: string): ProviderClient {
  if (label === 'anthropic') return anthropicClient(egress);
  if (label === 'openai') return openaiClient(egress);
  if (label === 'google') return googleClient(egress);
  if (label.startsWith('compatible-') && baseUrl) return compatibleClient(egress, baseUrl);
  throw new Error(`No client for ${label}.`);
}

export async function finish(stream: AsyncGenerator<StreamEvent>) {
  let text = '';
  for await (const e of stream) {
    if (e.type === 'text') text += e.text;
    else return { ...e, streamed: text };
  }
  throw new Error('The stream ended without its end event.');
}

export const ADD = {
  name: 'add',
  description: 'Adds two whole numbers and returns their sum.',
  parameters: {
    type: 'object',
    properties: { a: { type: 'integer' }, b: { type: 'integer' } },
    required: ['a', 'b'],
  },
};

const said = (parts: { type: string; text?: string }[]) =>
  parts.map((p) => (p.type === 'text' ? p.text : '')).join('');

const isKind =
  (...kinds: string[]) =>
  (err: unknown) =>
    err instanceof ProviderError && kinds.includes(err.kind);

export async function run(
  scenario: Scenario,
  client: ProviderClient,
  key: string,
  model: string,
  report?: (line: string) => void,
): Promise<void> {
  const compatible = client.provider === 'compatible';
  switch (scenario) {
    case 'declined':
      await assert.rejects(client.models(NOT_A_KEY), isKind('declined'));
      return;

    case 'models': {
      const models = await client.models(key);
      const ids = models.map((m) => m.id);
      report?.(
        `${ids.length} models: ${models.map((m) => `${m.id}${m.tools === false ? ' (no tools)' : ''}`).join(', ')}`,
      );
      assert.ok(ids.length > 0, 'no models listed');
      assert.ok(ids.includes(model), `${model} is not in the list`);
      return;
    }

    case 'text': {
      const end = await finish(
        client.stream(key, {
          model,
          system: 'You answer in as few words as possible.',
          turns: [
            { role: 'user', parts: [{ type: 'text', text: 'Reply with the single word: ready' }] },
          ],
          maxOutputTokens: 2000,
        }),
      );
      assert.equal(end.stop, 'done');
      assert.match(said(end.turn.parts), /ready/i);
      assert.equal(said(end.turn.parts), end.streamed);
      if (!compatible) {
        assert.ok(end.usage && end.usage.input > 0 && end.usage.output > 0, 'no usage');
      }
      return;
    }

    case 'tools': {
      const call = (turns: Turn[]): ModelCall => ({
        model,
        system: 'Use the add tool for any arithmetic. Then answer with the number alone.',
        turns,
        tools: [ADD],
        maxOutputTokens: 4000,
      });
      const ask: Turn = { role: 'user', parts: [{ type: 'text', text: 'What is 20 plus 22?' }] };
      const first = await finish(client.stream(key, call([ask])));
      assert.equal(first.stop, 'tool-calls');
      const toolCall = first.turn.parts.find((p) => p.type === 'tool-call');
      assert.ok(toolCall && toolCall.type === 'tool-call', 'no tool call');
      assert.equal(toolCall.name, 'add');
      assert.deepEqual(toolCall.input, { a: 20, b: 22 });
      const result: Turn = {
        role: 'user',
        parts: [
          { type: 'tool-result', callId: toolCall.id, name: 'add', output: '42', isError: false },
        ],
      };
      // The model's own turn goes back as it came (thinking and signatures included).
      const second = await finish(client.stream(key, call([ask, first.turn, result])));
      assert.equal(second.stop, 'done');
      assert.match(said(second.turn.parts), /42/);
      return;
    }

    case 'model-gone': {
      const stream = client.stream(key, {
        model: 'agent-v-no-such-model',
        turns: [{ role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
        maxOutputTokens: 20,
      });
      // Some compatible servers call an unknown model a bad request.
      await assert.rejects(
        finish(stream),
        isKind(...(compatible ? ['model-gone', 'bad-request'] : ['model-gone'])),
      );
      return;
    }
  }
}

export async function runSearch(
  scenario: SearchScenario,
  egress: Egress,
  key: string,
): Promise<void> {
  if (scenario === 'declined') {
    await assert.rejects(braveSearch(egress, NOT_A_KEY, 'agent v'), isKind('declined'));
    return;
  }
  const results = await braveSearch(egress, key, 'Wikipedia', { count: 3 });
  assert.ok(results.length > 0, 'no results');
  assert.ok(results.every((r) => r.url.startsWith('http') && r.title));
}
