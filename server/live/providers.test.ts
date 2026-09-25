import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { recommended } from '../src/ai/catalog.ts';
import type { ProviderClient, Turn } from '../src/ai/types.ts';
import { createEgress, type Egress } from '../src/egress/client.ts';
import { createGateway } from '../src/egress/gateway.ts';
import { createLogger } from '../src/log.ts';
import { ADD, clientFor, finish, NOT_A_KEY, run, SCENARIOS } from './scenarios.ts';

/**
 * Each client against the real provider, with the owner's test keys (stage 6, section 22; stage
 * 7, slice 2). Every call goes through a real egress gateway with the real public-address rule,
 * as in production.
 *
 * Settings (repository secrets in CI): ANTHROPIC_TEST_KEY, OPENAI_TEST_KEY, GOOGLE_TEST_KEY, and
 * COMPATIBLE_TEST_ENDPOINTS, one endpoint per line as "<base URL> <model> <key>". A provider
 * without a key is skipped, saying so; the checks that need no key (a declined key) always run.
 * The model each uses can be changed with ANTHROPIC_TEST_MODEL, OPENAI_TEST_MODEL and
 * GOOGLE_TEST_MODEL.
 *
 * With CAPTURE_DIR set, every exchange is also written there, as the dated test files the
 * clients' unit tests read (./README.md). Keys are never written: requests are kept without
 * their headers, and every file is checked for each key before it is written.
 */

const env = process.env;

// Each provider is checked with the model the catalog recommends for quick steps: the cheapest.
const quick = (provider: 'anthropic' | 'openai' | 'google') => {
  const m = recommended(provider, 'quick');
  if (!m) throw new Error(`The catalog has no quick-step model for ${provider}.`);
  return m.id;
};
const captureDir = env['CAPTURE_DIR'];
const secrets: string[] = [];

interface Target {
  label: string;
  client: (egress: Egress) => ProviderClient;
  key: string | undefined;
  model: string;
}

const targets: Target[] = [
  {
    label: 'anthropic',
    client: (egress) => clientFor('anthropic', egress),
    key: env['ANTHROPIC_TEST_KEY'],
    model: env['ANTHROPIC_TEST_MODEL'] || quick('anthropic'),
  },
  {
    label: 'openai',
    client: (egress) => clientFor('openai', egress),
    key: env['OPENAI_TEST_KEY'],
    model: env['OPENAI_TEST_MODEL'] || quick('openai'),
  },
  {
    label: 'google',
    client: (egress) => clientFor('google', egress),
    key: env['GOOGLE_TEST_KEY'],
    model: env['GOOGLE_TEST_MODEL'] || quick('google'),
  },
];
for (const [i, line] of (env['COMPATIBLE_TEST_ENDPOINTS'] ?? '')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .entries()) {
  const [base, model, key] = line.split(/\s+/);
  if (!base || !model || !key)
    throw new Error(`COMPATIBLE_TEST_ENDPOINTS line ${i + 1} needs a URL, a model and a key.`);
  const label = `compatible-${new URL(base).hostname}`;
  targets.push({
    label,
    client: (egress) => clientFor(label, egress, base),
    key,
    model,
  });
}
for (const t of targets) if (t.key) secrets.push(t.key);

let gateway: ReturnType<typeof createGateway>;
let egress: Egress;

before(async () => {
  gateway = createGateway({ logger: createLogger({ write: () => {} }) });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const direct = createEgress({
    gateway: { host: '127.0.0.1', port: (gateway.address() as AddressInfo).port },
  });
  egress = captureDir ? recording(direct) : direct;
});

after(() => {
  gateway.closeAllConnections();
  gateway.close();
});

// ---------------------------------------------------------------- capturing

let scenario = 'unnamed';
let currentModel = '';
const seen = new Map<string, number>();

/** Wraps the egress so each exchange is kept, for the unit tests to replay. */
function recording(inner: Egress): Egress {
  return async (url, init = {}) => {
    const res = await inner(url, init);
    const chunks: Buffer[] = [];
    for await (const c of res.body) chunks.push(Buffer.from(c));
    const body = Buffer.concat(chunks).toString('utf8');
    const name = scenario;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    const file = {
      capturedAt: new Date().toISOString().slice(0, 10),
      model: currentModel,
      request: {
        method: init.method ?? 'GET',
        url: redactUrl(url),
        body: init.body === undefined ? null : JSON.parse(init.body),
      },
      response: {
        status: res.status,
        contentType: res.headers['content-type'] ?? null,
        body,
      },
    };
    const text = `${JSON.stringify(file, null, 2)}\n`;
    for (const s of secrets) {
      if (text.includes(s)) throw new Error('A key would have been written to a capture; stopped.');
    }
    mkdirSync(captureDir as string, { recursive: true });
    writeFileSync(join(captureDir as string, `${name}${n > 1 ? `-${n}` : ''}.json`), text);
    let used = false;
    return {
      status: res.status,
      headers: res.headers,
      cancel: () => {},
      body: (async function* () {
        if (used) return;
        used = true;
        yield Buffer.from(body);
      })(),
    };
  };
}

// Addresses carry no keys for these providers, but a custom endpoint's might.
function redactUrl(url: string): string {
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()])
    if (/key|token/i.test(k)) u.searchParams.set(k, 'REDACTED');
  return u.href;
}

// ---------------------------------------------------------------- the checks

for (const t of targets) {
  describe(t.label, () => {
    for (const s of SCENARIOS) {
      // The declined check needs no key, so it always runs.
      const skip = s !== 'declined' && !t.key && 'no key';
      test(s, { skip }, async () => {
        scenario = `${t.label}-${s}`;
        currentModel = t.model;
        // The model list goes to the log, for choosing the catalog's models from what's offered.
        const report = (line: string) => process.stdout.write(`${t.label}: ${line}\n`);
        await run(s, t.client(egress), t.key ?? NOT_A_KEY, t.model, report);
      });
    }
  });
}

/** A turn from one provider carried to another: its words and calls, without its reasoning. */
test('a conversation moves between providers', async (ctx) => {
  const ready = targets.filter((t) => t.key);
  if (ready.length < 2) {
    ctx.skip('needs two providers with keys');
    return;
  }
  scenario = 'cross-provider';
  const [from, to] = ready as [Target, Target];
  const ask: Turn = { role: 'user', parts: [{ type: 'text', text: 'What is 20 plus 22?' }] };
  const first = await finish(
    from.client(egress).stream(from.key as string, {
      model: from.model,
      system: 'Use the add tool for any arithmetic.',
      turns: [ask],
      tools: [ADD],
      maxOutputTokens: 4000,
    }),
  );
  const toolCall = first.turn.parts.find((p) => p.type === 'tool-call');
  assert.ok(toolCall && toolCall.type === 'tool-call');
  const second = await finish(
    to.client(egress).stream(to.key as string, {
      model: to.model,
      system: 'Use the add tool for any arithmetic. Then answer with the number alone.',
      turns: [
        ask,
        first.turn,
        {
          role: 'user',
          parts: [
            { type: 'tool-result', callId: toolCall.id, name: 'add', output: '42', isError: false },
          ],
        },
      ],
      tools: [ADD],
      maxOutputTokens: 4000,
    }),
  );
  assert.match(second.turn.parts.map((p) => (p.type === 'text' ? p.text : '')).join(''), /42/);
});
