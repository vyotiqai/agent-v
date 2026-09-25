import type { Egress } from '../egress/client.ts';
import { events, num, obj, parseJson, readText, retryAfter, send, str, toolInput } from './http.ts';
import {
  type ModelCall,
  type ModelInfo,
  type ModelTurn,
  type ProviderClient,
  ProviderError,
  type ProviderErrorKind,
  type Stop,
  type StreamEvent,
  type TextPart,
  type ToolCall,
  type Turn,
  type Usage,
} from './types.ts';

/**
 * Anthropic's Messages API (stage 6, section 5): our own client. Answers stream as server-sent
 * events; each model turn is kept exactly as Anthropic returned it (thinking blocks and their
 * signatures included), since Anthropic requires them back unchanged on the next call.
 */

const BASE = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';

type Block = Record<string, unknown> & { type: string };

export function anthropicClient(egress: Egress): ProviderClient {
  const headers = (key: string) => ({
    'x-api-key': key,
    'anthropic-version': VERSION,
    'content-type': 'application/json',
  });

  return {
    provider: 'anthropic',

    async *stream(key, call) {
      const res = await send(egress, `${BASE}/messages`, {
        method: 'POST',
        headers: { ...headers(key), accept: 'text/event-stream' },
        body: JSON.stringify(requestBody(call)),
        signal: call.signal,
      });
      if (res.status !== 200) throw await failure(res.status, await readText(res), res.headers);
      yield* readStream(events(res, call.signal), call.model);
    },

    async models(key, signal) {
      const out: ModelInfo[] = [];
      let after: string | undefined;
      // Anthropic lists newest first, in pages; ten pages is far more than it offers.
      for (let page = 0; page < 10; page++) {
        const url = new URL(`${BASE}/models`);
        url.searchParams.set('limit', '1000');
        if (after) url.searchParams.set('after_id', after);
        const res = await send(egress, url.href, { headers: headers(key), signal });
        const text = await readText(res);
        if (res.status !== 200) throw failure(res.status, text, res.headers);
        const body = parseJson(text) as { data?: unknown; has_more?: unknown; last_id?: unknown };
        for (const m of Array.isArray(body?.data) ? body.data : []) {
          const id = str(m, 'id');
          if (!id) continue;
          out.push({
            id,
            name: str(m, 'display_name') ?? id,
            // Every Claude model uses tools.
            tools: true,
            contextTokens: num(m, 'max_input_tokens') ?? null,
            maxOutputTokens: num(m, 'max_tokens') ?? null,
          });
        }
        if (body?.has_more !== true || typeof body.last_id !== 'string') break;
        after = body.last_id;
      }
      return out;
    },
  };
}

function requestBody(call: ModelCall): Record<string, unknown> {
  return {
    model: call.model,
    max_tokens: call.maxOutputTokens,
    ...(call.system ? { system: call.system } : {}),
    messages: call.turns.map((t) => message(t, call.model)).filter((m) => m.content.length > 0),
    ...(call.tools?.length
      ? {
          tools: call.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
          })),
        }
      : {}),
    stream: true,
  };
}

function message(turn: Turn, model: string): { role: 'user' | 'assistant'; content: unknown[] } {
  if (turn.role === 'user') {
    // Tool results come first in their message, then any text (Anthropic's rule).
    const results = turn.parts
      .filter((p) => p.type === 'tool-result')
      .map((p) => ({
        type: 'tool_result',
        tool_use_id: safeId(p.callId),
        content: p.output,
        is_error: p.isError,
      }));
    const texts = turn.parts
      .filter((p): p is TextPart => p.type === 'text' && p.text !== '')
      .map((p) => ({ type: 'text', text: p.text }));
    return { role: 'user', content: [...results, ...texts] };
  }
  if (turn.provider === 'anthropic' && turn.model === model && Array.isArray(turn.native)) {
    return { role: 'assistant', content: turn.native };
  }
  // Another provider's or model's turn: what it said and called, without its reasoning.
  return {
    role: 'assistant',
    content: turn.parts
      .filter((p) => p.type !== 'text' || p.text !== '')
      .map((p) =>
        p.type === 'text'
          ? { type: 'text', text: p.text }
          : { type: 'tool_use', id: safeId(p.id), name: p.name, input: p.input },
      ),
  };
}

/** Anthropic's tool call ids allow letters, digits, "_" and "-"; other providers' may not. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function* readStream(
  stream: AsyncGenerator<{ event: string; data: string }>,
  model: string,
): AsyncGenerator<StreamEvent> {
  const blocks: Block[] = [];
  const json = new Map<number, string>();
  const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  let stopReason: string | undefined;
  let ended = false;

  const readUsage = (u: Record<string, unknown> | undefined) => {
    // Totals for the whole message, present only when they apply: replaced, never added.
    if (!u) return;
    usage.input = num(u, 'input_tokens') ?? usage.input;
    usage.cacheWrite = num(u, 'cache_creation_input_tokens') ?? usage.cacheWrite;
    usage.cacheRead = num(u, 'cache_read_input_tokens') ?? usage.cacheRead;
    usage.output = num(u, 'output_tokens') ?? usage.output;
  };

  for await (const { data } of stream) {
    const e = parseJson(data) as Record<string, unknown> | null;
    const index = num(e, 'index') ?? -1;
    switch (str(e, 'type')) {
      case 'message_start':
        readUsage(obj(obj(e, 'message'), 'usage'));
        break;
      case 'content_block_start': {
        const block = obj(e, 'content_block');
        if (!block || typeof block['type'] !== 'string') break;
        blocks[index] = { ...block } as Block;
        if (block['type'] === 'tool_use' || block['type'] === 'server_tool_use')
          json.set(index, '');
        break;
      }
      case 'content_block_delta': {
        const block = blocks[index];
        const delta = obj(e, 'delta');
        if (!block || !delta) break;
        const text = str(delta, 'text');
        switch (str(delta, 'type')) {
          case 'text_delta':
            block['text'] = `${str(block, 'text') ?? ''}${text ?? ''}`;
            if (text) yield { type: 'text', text };
            break;
          case 'input_json_delta':
            json.set(index, `${json.get(index) ?? ''}${str(delta, 'partial_json') ?? ''}`);
            break;
          case 'thinking_delta':
            block['thinking'] = `${str(block, 'thinking') ?? ''}${str(delta, 'thinking') ?? ''}`;
            break;
          case 'signature_delta':
            block['signature'] = str(delta, 'signature') ?? '';
            break;
          case 'citations_delta': {
            const list = Array.isArray(block['citations']) ? block['citations'] : [];
            block['citations'] = [...list, delta['citation']];
            break;
          }
        }
        break;
      }
      case 'content_block_stop': {
        const block = blocks[index];
        const buffered = json.get(index);
        if (block && buffered !== undefined) {
          block['input'] = toolInput(buffered);
          json.delete(index);
        }
        break;
      }
      case 'message_delta':
        stopReason = str(obj(e, 'delta'), 'stop_reason') ?? stopReason;
        readUsage(obj(e, 'usage'));
        break;
      case 'message_stop':
        ended = true;
        break;
      case 'error': {
        const err = obj(e, 'error');
        throw new ProviderError(kindOf(str(err, 'type'), undefined, str(err, 'message')), {
          message: str(err, 'message'),
        });
      }
      // "ping", and event types added after this was written, are read past.
    }
    if (ended) break;
  }
  if (!ended) {
    throw new ProviderError('provider-down', { message: 'The answer stopped before its end.' });
  }

  const native = blocks.filter(Boolean);
  const parts: (TextPart | ToolCall)[] = [];
  for (const b of native) {
    if (b.type === 'text') parts.push({ type: 'text', text: str(b, 'text') ?? '' });
    if (b.type === 'tool_use') {
      parts.push({
        type: 'tool-call',
        id: str(b, 'id') ?? '',
        name: str(b, 'name') ?? '',
        input: obj(b, 'input') ?? {},
      });
    }
  }
  const turn: ModelTurn = { role: 'model', provider: 'anthropic', model, parts, native };
  const total: Usage = {
    input: usage.input + usage.cacheWrite + usage.cacheRead,
    cachedInput: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    output: usage.output,
  };
  yield { type: 'end', turn, stop: stopOf(stopReason), usage: total };
}

function stopOf(reason: string | undefined): Stop {
  switch (reason) {
    case 'tool_use':
      return 'tool-calls';
    case 'max_tokens':
      return 'max-tokens';
    case 'refusal':
      return 'refused';
    case 'model_context_window_exceeded':
      return 'context-full';
    // "pause_turn" comes only with Anthropic's own server tools, which slice 3 adds with the
    // research tools; it is handled there.
    default:
      return 'done';
  }
}

/** Anthropic's error types, and statuses where the body doesn't say. */
function kindOf(
  type: string | undefined,
  status: number | undefined,
  message?: string,
): ProviderErrorKind {
  if (type === 'billing_error' || status === 402 || /credit balance/i.test(message ?? '')) {
    return 'no-credit';
  }
  switch (type) {
    case 'authentication_error':
    case 'permission_error':
      return 'declined';
    case 'not_found_error':
      return 'model-gone';
    case 'rate_limit_error':
      return 'rate-limited';
    case 'invalid_request_error':
    case 'request_too_large':
      return 'bad-request';
    case 'overloaded_error':
    case 'api_error':
    case 'timeout_error':
      return 'provider-down';
  }
  if (status === 401 || status === 403) return 'declined';
  if (status === 404) return 'model-gone';
  if (status === 429) return 'rate-limited';
  if (status !== undefined && status >= 400 && status < 500) return 'bad-request';
  return 'provider-down';
}

function failure(
  status: number,
  text: string,
  headers: Parameters<typeof retryAfter>[0],
): ProviderError {
  const err = obj(parseJson(text), 'error');
  const message = str(err, 'message');
  return new ProviderError(kindOf(str(err, 'type'), status, message), {
    status,
    retryAfterMs: retryAfter(headers),
    message,
  });
}
