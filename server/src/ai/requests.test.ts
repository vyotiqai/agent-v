import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Egress, EgressError, type EgressRequest } from '../egress/client.ts';
import { anthropicClient } from './anthropic.ts';
import { compatibleClient } from './compatible.ts';
import { googleClient } from './google.ts';
import { openaiClient } from './openai.ts';
import {
  type ModelCall,
  type ModelTurn,
  type ProviderClient,
  ProviderError,
  type Turn,
} from './types.ts';

// What each client sends, and how it reads a refusal. The answers themselves (streams, model
// lists) are tested against real captured responses in ./replay.test.ts.

interface Sent {
  url: string;
  init: EgressRequest;
}

/** An egress that records the call and answers with the given status and body. */
function answering(status: number, body: string, headers: Record<string, string> = {}) {
  const sent: Sent[] = [];
  const egress: Egress = async (url, init = {}) => {
    sent.push({ url, init });
    return {
      status,
      headers: { 'content-type': 'application/json', ...headers },
      cancel: () => {},
      body: (async function* () {
        yield Buffer.from(body);
      })(),
    };
  };
  return { egress, sent };
}

async function refusal(client: ProviderClient, call: ModelCall): Promise<ProviderError> {
  try {
    for await (const _ of client.stream('k', call)) {
      // A refused call yields nothing.
    }
  } catch (err) {
    assert.ok(err instanceof ProviderError, String(err));
    return err;
  }
  assert.fail('The call was not refused.');
}

const sentBody = (sent: Sent[]) => JSON.parse(sent[0]?.init.body ?? 'null');

// A conversation with a tool round: asked, the model called a tool, the result came back.
const ask: Turn = { role: 'user', parts: [{ type: 'text', text: 'What is 20 plus 22?' }] };
const result = (callId: string): Turn => ({
  role: 'user',
  parts: [
    { type: 'text', text: 'Here it is.' },
    { type: 'tool-result', callId, name: 'add', output: '42', isError: false },
  ],
});
const turnFrom = (
  provider: ModelTurn['provider'],
  model: string,
  id: string,
  native: unknown,
): ModelTurn => ({
  role: 'model',
  provider,
  model,
  parts: [
    { type: 'text', text: 'Adding.' },
    { type: 'tool-call', id, name: 'add', input: { a: 20, b: 22 } },
  ],
  native,
});
const add = {
  name: 'add',
  description: 'Adds.',
  parameters: { type: 'object', properties: { a: { type: 'integer' } } },
};
const call = (model: string, turns: Turn[]): ModelCall => ({
  model,
  system: 'Be brief.',
  turns,
  tools: [add],
  maxOutputTokens: 1000,
});

test('Anthropic: its own turn goes back unchanged; results come first; other turns are converted', async () => {
  const nativeBlocks = [
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'tool_use', id: 'toolu_1', name: 'add', input: { a: 20, b: 22 } },
  ];
  const { egress, sent } = answering(
    400,
    '{"type":"error","error":{"type":"invalid_request_error","message":"x"}}',
  );
  const err = await refusal(
    anthropicClient(egress),
    call('claude-sonnet-5', [
      ask,
      turnFrom('anthropic', 'claude-sonnet-5', 'toolu_1', nativeBlocks),
      result('toolu_1'),
    ]),
  );
  assert.equal(err.kind, 'bad-request');
  assert.equal(sent[0]?.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent[0]?.init.headers?.['x-api-key'], 'k');
  assert.equal(sent[0]?.init.headers?.['anthropic-version'], '2023-06-01');
  const body = sentBody(sent);
  assert.equal(body.system, 'Be brief.');
  assert.equal(body.max_tokens, 1000);
  assert.equal(body.stream, true);
  assert.deepEqual(body.tools, [
    { name: 'add', description: 'Adds.', input_schema: add.parameters },
  ]);
  assert.deepEqual(body.messages[1], { role: 'assistant', content: nativeBlocks });
  assert.deepEqual(body.messages[2].content, [
    { type: 'tool_result', tool_use_id: 'toolu_1', content: '42', is_error: false },
    { type: 'text', text: 'Here it is.' },
  ]);

  // Another provider's turn: its words and its call, with an id Anthropic accepts.
  const other = answering(400, '{}');
  await refusal(
    anthropicClient(other.egress),
    call('claude-sonnet-5', [
      ask,
      turnFrom('google', 'gemini-x', 'fc:1/a', ['opaque']),
      result('fc:1/a'),
    ]),
  );
  const moved = sentBody(other.sent).messages;
  assert.deepEqual(moved[1].content, [
    { type: 'text', text: 'Adding.' },
    { type: 'tool_use', id: 'fc_1_a', name: 'add', input: { a: 20, b: 22 } },
  ]);
  assert.equal(moved[2].content[0].tool_use_id, 'fc_1_a');
});

test("Anthropic's refusals become our kinds", async () => {
  const cases: [number, string, string, Record<string, string>?][] = [
    [
      401,
      '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
      'declined',
    ],
    [403, '{"type":"error","error":{"type":"permission_error","message":"no"}}', 'declined'],
    [402, '{"type":"error","error":{"type":"billing_error","message":"Add credits"}}', 'no-credit'],
    [
      400,
      '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
      'no-credit',
    ],
    [404, '{"type":"error","error":{"type":"not_found_error","message":"model: x"}}', 'model-gone'],
    [
      429,
      '{"type":"error","error":{"type":"rate_limit_error","message":"slow"}}',
      'rate-limited',
      { 'retry-after': '7' },
    ],
    [
      529,
      '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      'provider-down',
    ],
    [413, '<html>Request Entity Too Large</html>', 'bad-request'],
    [502, 'Bad gateway', 'provider-down'],
  ];
  for (const [status, body, kind, headers] of cases) {
    const err = await refusal(
      anthropicClient(answering(status, body, headers).egress),
      call('m', [ask]),
    );
    assert.equal(err.kind, kind, `${status} ${body}`);
    assert.equal(err.status, status);
    if (headers) assert.equal(err.retryAfterMs, 7000);
  }
});

test('OpenAI: storage off, reasoning kept; its own items go back as they came; others are converted', async () => {
  const items = [
    { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'enc' },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'add',
      arguments: '{"a":20,"b":22}',
    },
  ];
  const { egress, sent } = answering(
    400,
    '{"error":{"message":"x","type":"invalid_request_error","code":null}}',
  );
  await refusal(
    openaiClient(egress),
    call('gpt-x', [ask, turnFrom('openai', 'gpt-x', 'call_1', items), result('call_1')]),
  );
  assert.equal(sent[0]?.url, 'https://api.openai.com/v1/responses');
  assert.equal(sent[0]?.init.headers?.['authorization'], 'Bearer k');
  const body = sentBody(sent);
  assert.equal(body.store, false);
  assert.deepEqual(body.include, ['reasoning.encrypted_content']);
  assert.equal(body.instructions, 'Be brief.');
  assert.equal(body.max_output_tokens, 1000);
  assert.deepEqual(body.tools, [
    {
      type: 'function',
      name: 'add',
      description: 'Adds.',
      parameters: add.parameters,
      strict: false,
    },
  ]);
  assert.deepEqual(body.input, [
    { role: 'user', content: [{ type: 'input_text', text: 'What is 20 plus 22?' }] },
    ...items,
    { type: 'function_call_output', call_id: 'call_1', output: '42' },
    { role: 'user', content: [{ type: 'input_text', text: 'Here it is.' }] },
  ]);

  // The same provider but another model: no reasoning, no item ids.
  const other = answering(400, '{}');
  await refusal(
    openaiClient(other.egress),
    call('gpt-y', [ask, turnFrom('openai', 'gpt-x', 'call_1', items), result('call_1')]),
  );
  assert.deepEqual(sentBody(other.sent).input.slice(1, 3), [
    { role: 'assistant', content: 'Adding.' },
    { type: 'function_call', call_id: 'call_1', name: 'add', arguments: '{"a":20,"b":22}' },
  ]);
});

test("OpenAI's refusals become our kinds", async () => {
  const cases: [number, string, string, Record<string, string>?][] = [
    [
      401,
      '{"error":{"message":"Incorrect API key provided","type":"invalid_request_error","code":"invalid_api_key"}}',
      'declined',
    ],
    [
      429,
      '{"error":{"message":"You exceeded your current quota","type":"insufficient_quota","code":"insufficient_quota"}}',
      'no-credit',
    ],
    [
      429,
      '{"error":{"message":"Rate limit reached","type":"requests","code":"rate_limit_exceeded"}}',
      'rate-limited',
      { 'retry-after-ms': '7000' },
    ],
    [
      404,
      '{"error":{"message":"The model `x` does not exist","type":"invalid_request_error","code":"model_not_found"}}',
      'model-gone',
    ],
    [
      400,
      '{"error":{"message":"context too long","type":"invalid_request_error","code":"context_length_exceeded"}}',
      'bad-request',
    ],
    [500, '{"error":{"message":"oops","type":"server_error","code":null}}', 'provider-down'],
  ];
  for (const [status, body, kind, headers] of cases) {
    const err = await refusal(
      openaiClient(answering(status, body, headers).egress),
      call('m', [ask]),
    );
    assert.equal(err.kind, kind, body);
    if (headers) assert.equal(err.retryAfterMs, 7000);
  }
});

test('Google: storage off; function results and user input as steps; its own steps go back as they came', async () => {
  const steps = [
    { type: 'thought', signature: 'sig' },
    { type: 'function_call', id: 'g1', name: 'add', arguments: { a: 20, b: 22 } },
  ];
  const { egress, sent } = answering(
    400,
    '{"error":{"code":400,"message":"x","status":"INVALID_ARGUMENT"}}',
  );
  const err = await refusal(
    googleClient(egress),
    call('gemini-x', [ask, turnFrom('google', 'gemini-x', 'g1', steps), result('g1')]),
  );
  assert.equal(err.kind, 'bad-request');
  assert.equal(sent[0]?.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(sent[0]?.init.headers?.['x-goog-api-key'], 'k');
  const body = sentBody(sent);
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.system_instruction, 'Be brief.');
  assert.deepEqual(body.generation_config, { max_output_tokens: 1000 });
  assert.deepEqual(body.tools, [
    { type: 'function', name: 'add', description: 'Adds.', parameters: add.parameters },
  ]);
  assert.deepEqual(body.input, [
    { type: 'user_input', content: [{ type: 'text', text: 'What is 20 plus 22?' }] },
    ...steps,
    { type: 'function_result', call_id: 'g1', name: 'add', result: '42' },
    { type: 'user_input', content: [{ type: 'text', text: 'Here it is.' }] },
  ]);
});

test("Google's refusals become our kinds; its ordinary rate limit isn't mistaken for no credit", async () => {
  // The first body is Google's real answer to a key that isn't valid (captured 2026-09-25).
  const invalidKey = JSON.stringify({
    error: {
      code: 400,
      message: 'API key not valid. Please pass a valid API key.',
      status: 'INVALID_ARGUMENT',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'API_KEY_INVALID',
          domain: 'googleapis.com',
        },
      ],
    },
  });
  const rateLimit = JSON.stringify({
    error: {
      code: 429,
      message: 'You exceeded your current quota, please check your plan and billing details.',
      status: 'RESOURCE_EXHAUSTED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }],
    },
  });
  const cases: [number, string, string][] = [
    [400, invalidKey, 'declined'],
    [403, '{"error":{"code":403,"message":"denied","status":"PERMISSION_DENIED"}}', 'declined'],
    [429, rateLimit, 'rate-limited'],
    [
      429,
      '{"error":{"code":429,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}',
      'no-credit',
    ],
    [
      404,
      '{"error":{"code":404,"message":"models/x is not found","status":"NOT_FOUND"}}',
      'model-gone',
    ],
    [
      503,
      '{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}',
      'provider-down',
    ],
  ];
  for (const [status, body, kind] of cases) {
    const err = await refusal(googleClient(answering(status, body).egress), call('m', [ask]));
    assert.equal(err.kind, kind, body);
  }
  const limited = await refusal(googleClient(answering(429, rateLimit).egress), call('m', [ask]));
  assert.equal(limited.retryAfterMs, 37_000);
});

test('Compatible: system first, tool messages, and nine-character ids for other providers’ calls', async () => {
  const { egress, sent } = answering(400, '{"error":{"message":"x"}}');
  await refusal(
    compatibleClient(egress, 'https://openrouter.ai/api/v1/'),
    call('some/model', [
      ask,
      turnFrom('anthropic', 'claude-x', 'toolu_01ABC', []),
      result('toolu_01ABC'),
    ]),
  );
  assert.equal(sent[0]?.url, 'https://openrouter.ai/api/v1/chat/completions');
  const body = sentBody(sent);
  assert.equal(body.max_tokens, 1000);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.deepEqual(body.tools, [
    {
      type: 'function',
      function: { name: 'add', description: 'Adds.', parameters: add.parameters },
    },
  ]);
  const [system, user, assistant, tool, text] = body.messages;
  assert.deepEqual(system, { role: 'system', content: 'Be brief.' });
  assert.deepEqual(user, { role: 'user', content: 'What is 20 plus 22?' });
  const id = assistant.tool_calls[0].id;
  assert.match(id, /^[A-Za-z0-9]{9}$/);
  assert.deepEqual(assistant, {
    role: 'assistant',
    content: 'Adding.',
    tool_calls: [{ id, type: 'function', function: { name: 'add', arguments: '{"a":20,"b":22}' } }],
  });
  assert.deepEqual(tool, { role: 'tool', tool_call_id: id, content: '42' });
  assert.deepEqual(text, { role: 'user', content: 'Here it is.' });

  // Its own turn, the same model: as it came, reasoning included (DeepSeek needs it back).
  const native = { role: 'assistant', content: null, reasoning_content: 'hmm', tool_calls: [] };
  const again = answering(400, '{}');
  await refusal(
    compatibleClient(again.egress, 'https://api.deepseek.com'),
    call('deepseek-x', [ask, turnFrom('compatible', 'deepseek-x', 'c1', native), result('c1')]),
  );
  assert.deepEqual(sentBody(again.sent).messages[2], native);
});

test("Compatible servers' refusals, in their different shapes, become our kinds", async () => {
  const cases: [number, string, string][] = [
    [402, '{"error":{"code":402,"message":"Insufficient credits"}}', 'no-credit'],
    [401, '{"error":"Invalid API key"}', 'declined'],
    [
      400,
      '{"object":"error","message":"bad","type":"BadRequestError","param":null,"code":400}',
      'bad-request',
    ],
    [404, '{"error":{"message":"model \\"x\\" not found, try pulling it first"}}', 'model-gone'],
    [429, 'Too many requests', 'rate-limited'],
    [503, '', 'provider-down'],
  ];
  for (const [status, body, kind] of cases) {
    const err = await refusal(
      compatibleClient(answering(status, body).egress, 'https://x.test/v1'),
      call('m', [ask]),
    );
    assert.equal(err.kind, kind, body);
  }
});

test('a call that can’t be made is our own kind: an address not allowed, or unreachable', async () => {
  const failing =
    (kind: EgressError['kind']): Egress =>
    async () => {
      throw new EgressError(kind);
    };
  for (const [egressKind, kind] of [
    ['private-address', 'address-not-allowed'],
    ['bad-address', 'address-not-allowed'],
    ['dns', 'unreachable'],
    ['timeout', 'unreachable'],
    ['connect-failed', 'unreachable'],
  ] as const) {
    const err = await refusal(
      compatibleClient(failing(egressKind), 'https://x.test/v1'),
      call('m', [ask]),
    );
    assert.equal(err.kind, kind, egressKind);
  }
});
