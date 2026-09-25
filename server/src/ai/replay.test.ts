import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { clientFor, NOT_A_KEY, run, SCENARIOS, type Scenario } from '../../live/scenarios.ts';
import type { Egress } from '../egress/client.ts';

/**
 * Each client against real responses captured from its provider (stage 6, section 22): the
 * same checks as the live run (../../live/scenarios.ts), replayed from ./captures. Every
 * request the client makes must be the one that was captured, so a change to what we send is
 * caught here too; every answer is fed back in small pieces, as a network would.
 *
 * The captures are made by the Providers check with the owner's test keys, and dated; they are
 * refreshed whenever a provider changes its format (./captures/README.md).
 */

interface Capture {
  capturedAt: string;
  model: string;
  request: { method: string; url: string; body: unknown };
  response: { status: number; contentType: string | null; body: string };
}

const dir = fileURLToPath(new URL('./captures', import.meta.url));
const pattern = new RegExp(`^(.+)-(${SCENARIOS.join('|')})(?:-(\\d+))?\\.json$`);

// label → scenario → exchanges, in the order they were made.
const found = new Map<string, Map<Scenario, Capture[]>>();
for (const file of existsSync(dir) ? readdirSync(dir).sort() : []) {
  const m = pattern.exec(file);
  if (!m) continue;
  const [, label, scenario, n] = m as unknown as [string, string, Scenario, string | undefined];
  const byScenario = found.get(label) ?? new Map<Scenario, Capture[]>();
  found.set(label, byScenario);
  const list = byScenario.get(scenario) ?? [];
  list[Number(n ?? 1) - 1] = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Capture;
  byScenario.set(scenario, list);
}

/** Answers each call with the next captured exchange, after checking it is the same request. */
function replaying(exchanges: Capture[]): { egress: Egress; used: () => number } {
  let next = 0;
  const egress: Egress = async (url, init = {}) => {
    const c = exchanges[next++];
    assert.ok(c, `an unexpected call to ${url}`);
    assert.equal(init.method ?? 'GET', c.request.method);
    assert.equal(url, c.request.url);
    assert.deepEqual(init.body === undefined ? null : JSON.parse(init.body), c.request.body);
    const bytes = Buffer.from(c.response.body);
    return {
      status: c.response.status,
      headers: c.response.contentType ? { 'content-type': c.response.contentType } : {},
      cancel: () => {},
      body: (async function* () {
        for (let i = 0; i < bytes.length; i += 7) yield bytes.subarray(i, i + 7);
      })(),
    };
  };
  return { egress, used: () => next };
}

// The base URL of a compatible endpoint, from the address its calls went to.
const baseOf = (url: string) => url.replace(/\/(chat\/completions|models)(\?.*)?$/, '');

for (const [label, scenarios] of found) {
  describe(`${label}, replayed`, () => {
    for (const [scenario, exchanges] of scenarios) {
      const first = exchanges[0] as Capture;
      test(`${scenario} (captured ${first.capturedAt})`, async () => {
        const replay = replaying(exchanges);
        const client = clientFor(label, replay.egress, baseOf(first.request.url));
        await run(scenario, client, scenario === 'declined' ? NOT_A_KEY : 'k', first.model);
        assert.equal(replay.used(), exchanges.length, 'not every captured call was made');
      });
    }
  });
}
