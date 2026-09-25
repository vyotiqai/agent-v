import type { Egress } from '../egress/client.ts';
import { failure, openaiKind } from './compatible.ts';
import { events, num, obj, parseJson, readText, send, str, toolInput } from './http.ts';
import {
  type ModelCall,
  type ModelInfo,
  type ModelTurn,
  type ProviderClient,
  ProviderError,
  type Stop,
  type StreamEvent,
  type TextPart,
  type ToolCall,
  type Turn,
  type Usage,
} from './types.ts';

/**
 * OpenAI's Responses API (stage 6, section 5), called with storage off (`store: false`), so the
 * conversation lives only in our record. Its reasoning comes back encrypted and is sent back
 * with the next call, which is how a stateless conversation keeps it.
 */

const BASE = 'https://api.openai.com/v1';

type Item = Record<string, unknown> & { type?: string };

export function openaiClient(egress: Egress): ProviderClient {
  const headers = (key: string) => ({
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  });

  return {
    provider: 'openai',

    async *stream(key, call) {
      const res = await send(egress, `${BASE}/responses`, {
        method: 'POST',
        headers: { ...headers(key), accept: 'text/event-stream' },
        body: JSON.stringify(requestBody(call)),
        signal: call.signal,
      });
      if (res.status !== 200) throw failure(res.status, await readText(res), res.headers);
      yield* readStream(events(res, call.signal), call.model);
    },

    async models(key, signal) {
      const res = await send(egress, `${BASE}/models`, { headers: headers(key), signal });
      const text = await readText(res);
      if (res.status !== 200) throw failure(res.status, text, res.headers);
      const body = parseJson(text) as { data?: unknown } | null;
      const out: ModelInfo[] = [];
      for (const m of Array.isArray(body?.data) ? body.data : []) {
        const id = str(m, 'id');
        // OpenAI's list says nothing about what each model can do; our catalog knows the ones
        // we recommend (./catalog.ts), and the rest are left unknown.
        if (id) out.push({ id, name: id, tools: null, contextTokens: null, maxOutputTokens: null });
      }
      return out;
    },
  };
}

function requestBody(call: ModelCall): Record<string, unknown> {
  return {
    model: call.model,
    ...(call.system ? { instructions: call.system } : {}),
    input: input(call.turns, call.model),
    ...(call.tools?.length
      ? {
          tools: call.tools.map((t) => ({
            type: 'function',
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            strict: false,
          })),
        }
      : {}),
    max_output_tokens: call.maxOutputTokens,
    store: false,
    include: ['reasoning.encrypted_content'],
    stream: true,
  };
}

function input(turns: Turn[], model: string): unknown[] {
  const out: unknown[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      for (const p of turn.parts) {
        if (p.type === 'tool-result') {
          out.push({ type: 'function_call_output', call_id: p.callId, output: p.output });
        }
      }
      const texts = turn.parts
        .filter((p): p is TextPart => p.type === 'text' && p.text !== '')
        .map((p) => ({ type: 'input_text', text: p.text }));
      if (texts.length) out.push({ role: 'user', content: texts });
      continue;
    }
    if (turn.provider === 'openai' && turn.model === model && Array.isArray(turn.native)) {
      // Every item as it came, reasoning included, in its order.
      out.push(...turn.native);
      continue;
    }
    // Another provider's or model's turn: its words and calls, without reasoning or item ids,
    // which only pair with reasoning from the same model.
    for (const p of turn.parts) {
      if (p.type === 'text') {
        if (p.text) out.push({ role: 'assistant', content: p.text });
      } else {
        out.push({
          type: 'function_call',
          call_id: p.id,
          name: p.name,
          arguments: JSON.stringify(p.input),
        });
      }
    }
  }
  return out;
}

async function* readStream(
  stream: AsyncGenerator<{ event: string; data: string }>,
  model: string,
): AsyncGenerator<StreamEvent> {
  // Each finished output item, by its position; the finished item is the complete one.
  const items: Item[] = [];
  let terminal: Record<string, unknown> | undefined;
  let incomplete: string | undefined;

  for await (const { data } of stream) {
    if (data === '[DONE]') break;
    const e = parseJson(data) as Record<string, unknown> | null;
    switch (str(e, 'type')) {
      case 'response.output_text.delta': {
        const text = str(e, 'delta');
        if (text) yield { type: 'text', text };
        break;
      }
      case 'response.output_item.done': {
        const item = obj(e, 'item');
        const index = num(e, 'output_index');
        if (item && index !== undefined) items[index] = item;
        break;
      }
      case 'response.completed':
        terminal = obj(e, 'response');
        break;
      case 'response.incomplete':
        terminal = obj(e, 'response');
        incomplete = str(obj(terminal, 'incomplete_details'), 'reason') ?? 'unknown';
        break;
      case 'response.failed': {
        const err = obj(obj(e, 'response'), 'error');
        throw new ProviderError(failedKind(str(err, 'code')), { message: str(err, 'message') });
      }
      case 'error': {
        const err = obj(e, 'error') ?? e;
        throw new ProviderError(openaiKind(undefined, err), { message: str(err, 'message') });
      }
      // Everything else (the item and part markers, reasoning summaries, argument fragments)
      // is complete in the finished items above.
    }
    if (terminal) break;
  }
  if (!terminal) {
    throw new ProviderError('provider-down', { message: 'The answer stopped before its end.' });
  }

  const output = items.filter(Boolean);
  const native = output.length ? output : ((terminal['output'] as Item[] | undefined) ?? []);
  const parts: (TextPart | ToolCall)[] = [];
  let refused = false;
  for (const item of native) {
    if (item.type === 'message') {
      const content = Array.isArray(item['content']) ? item['content'] : [];
      const text = content.map((c) => str(c, 'text') ?? '').join('');
      if (text) parts.push({ type: 'text', text });
      if (content.some((c) => str(c, 'type') === 'refusal')) refused = true;
    }
    if (item.type === 'function_call') {
      parts.push({
        type: 'tool-call',
        id: str(item, 'call_id') ?? '',
        name: str(item, 'name') ?? '',
        input: toolInput(str(item, 'arguments') ?? ''),
      });
    }
  }
  const turn: ModelTurn = { role: 'model', provider: 'openai', model, parts, native };
  yield { type: 'end', turn, stop: stopOf(parts, incomplete, refused), usage: readUsage(terminal) };
}

function stopOf(
  parts: (TextPart | ToolCall)[],
  incomplete: string | undefined,
  refused: boolean,
): Stop {
  if (parts.some((p) => p.type === 'tool-call')) return 'tool-calls';
  if (incomplete === 'max_output_tokens') return 'max-tokens';
  if (incomplete === 'content_filter' || refused) return 'refused';
  return 'done';
}

function readUsage(response: Record<string, unknown>): Usage | null {
  const u = obj(response, 'usage');
  const input = num(u, 'input_tokens');
  const output = num(u, 'output_tokens');
  if (input === undefined || output === undefined) return null;
  const details = obj(u, 'input_tokens_details');
  return {
    input,
    cachedInput: num(details, 'cached_tokens') ?? 0,
    cacheWrite: num(details, 'cache_write_tokens') ?? 0,
    output,
  };
}

/** A response that failed after it started names a code, not a status. */
function failedKind(code: string | undefined) {
  if (code === 'rate_limit_exceeded') return 'rate-limited' as const;
  if (code === 'insufficient_quota') return 'no-credit' as const;
  if (code === 'invalid_prompt') return 'bad-request' as const;
  return 'provider-down' as const;
}
