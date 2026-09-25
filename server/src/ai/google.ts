import type { IncomingHttpHeaders } from 'node:http';
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
 * Google's Gemini Interactions API (stage 6, section 5), with storage off (`store: false`) so
 * the conversation lives only in our record. Stage 6 left the choice between it and the older
 * generateContent API to this slice: Interactions is Google's recommended API since June 2026
 * and its stateless mode keeps nothing on Google's side (D147).
 *
 * A conversation is a flat list of steps. The model's steps, its thoughts with their signatures
 * included, go back exactly as they came.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

type Step = Record<string, unknown> & { type?: string };

export function googleClient(egress: Egress): ProviderClient {
  const headers = (key: string) => ({ 'x-goog-api-key': key, 'content-type': 'application/json' });

  return {
    provider: 'google',

    async *stream(key, call) {
      const res = await send(egress, `${BASE}/interactions`, {
        method: 'POST',
        headers: { ...headers(key), accept: 'text/event-stream' },
        body: JSON.stringify(requestBody(call)),
        signal: call.signal,
      });
      if (res.status !== 200) throw failure(res.status, await readText(res), res.headers);
      yield* readStream(events(res, call.signal), call.model);
    },

    async models(key, signal) {
      const out: ModelInfo[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 10; page++) {
        const url = new URL(`${BASE}/models`);
        url.searchParams.set('pageSize', '1000');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        const res = await send(egress, url.href, { headers: headers(key), signal });
        const text = await readText(res);
        if (res.status !== 200) throw failure(res.status, text, res.headers);
        const body = parseJson(text) as { models?: unknown; nextPageToken?: unknown } | null;
        for (const m of Array.isArray(body?.models) ? body.models : []) {
          const name = str(m, 'name');
          const methods = (m as { supportedGenerationMethods?: unknown })
            .supportedGenerationMethods;
          // Only models that write text answers; embeddings and the like can't run jobs.
          if (!name || !Array.isArray(methods) || !methods.includes('generateContent')) continue;
          const id = name.replace(/^models\//, '');
          out.push({
            id,
            name: str(m, 'displayName') ?? id,
            // Google's list doesn't say; its Gemini text models all call functions, and our
            // catalog confirms the ones we recommend.
            tools:
              /^gemini-/.test(id) && !/(image|tts|audio|live|embedding)/.test(id) ? true : null,
            contextTokens: num(m, 'inputTokenLimit') ?? null,
            maxOutputTokens: num(m, 'outputTokenLimit') ?? null,
          });
        }
        const next = body?.nextPageToken;
        if (typeof next !== 'string' || next === '') break;
        pageToken = next;
      }
      return out;
    },
  };
}

function requestBody(call: ModelCall): Record<string, unknown> {
  return {
    model: call.model,
    store: false,
    stream: true,
    ...(call.system ? { system_instruction: call.system } : {}),
    input: steps(call.turns, call.model),
    ...(call.tools?.length
      ? {
          tools: call.tools.map((t) => ({
            type: 'function',
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        }
      : {}),
    generation_config: { max_output_tokens: call.maxOutputTokens },
  };
}

function steps(turns: Turn[], model: string): unknown[] {
  const out: unknown[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      for (const p of turn.parts) {
        if (p.type === 'tool-result') {
          out.push({
            type: 'function_result',
            call_id: p.callId,
            name: p.name,
            result: p.output,
            ...(p.isError ? { is_error: true } : {}),
          });
        }
      }
      const content = turn.parts
        .filter((p): p is TextPart => p.type === 'text' && p.text !== '')
        .map((p) => ({ type: 'text', text: p.text }));
      if (content.length) out.push({ type: 'user_input', content });
      continue;
    }
    if (turn.provider === 'google' && turn.model === model && Array.isArray(turn.native)) {
      out.push(...turn.native);
      continue;
    }
    for (const p of turn.parts) {
      out.push(
        p.type === 'text'
          ? { type: 'model_output', content: [{ type: 'text', text: p.text }] }
          : { type: 'function_call', id: p.id, name: p.name, arguments: p.input },
      );
    }
  }
  return out;
}

async function* readStream(
  stream: AsyncGenerator<{ event: string; data: string }>,
  model: string,
): AsyncGenerator<StreamEvent> {
  const built: Step[] = [];
  const args = new Map<number, string>();
  let completed: Record<string, unknown> | undefined;

  for await (const { data } of stream) {
    if (data === '[DONE]') break;
    const e = parseJson(data) as Record<string, unknown> | null;
    const index = num(e, 'index') ?? -1;
    // The event's own kind is in its JSON, not in the stream's event name.
    switch (str(e, 'event_type')) {
      case 'step.start': {
        const step = obj(e, 'step');
        if (step) built[index] = structuredClone(step);
        break;
      }
      case 'step.delta': {
        const step = built[index];
        const delta = obj(e, 'delta');
        if (!step || !delta) break;
        switch (str(delta, 'type')) {
          case 'text': {
            const text = str(delta, 'text') ?? '';
            appendText(step, text);
            if (text) yield { type: 'text', text };
            break;
          }
          case 'thought_summary': {
            const content = obj(delta, 'content');
            if (content) step['summary'] = [...list(step['summary']), content];
            break;
          }
          case 'thought_signature':
            step['signature'] = str(delta, 'signature') ?? step['signature'];
            break;
          case 'arguments_delta':
            args.set(index, `${args.get(index) ?? ''}${str(delta, 'arguments') ?? ''}`);
            break;
        }
        break;
      }
      case 'step.stop': {
        const step = built[index];
        const buffered = args.get(index);
        if (step && buffered !== undefined) {
          step['arguments'] = toolInput(buffered);
          args.delete(index);
        }
        break;
      }
      case 'interaction.completed':
        completed = obj(e, 'interaction');
        break;
      case 'error': {
        const err = obj(e, 'error');
        throw new ProviderError(kindOf(undefined, undefined, str(err, 'message')), {
          message: str(err, 'message'),
        });
      }
      // "interaction.created" and "interaction.status_update" add nothing we keep.
    }
    if (completed) break;
  }
  if (!completed) {
    throw new ProviderError('provider-down', { message: 'The answer stopped before its end.' });
  }
  const status = str(completed, 'status');
  if (status === 'failed' || status === 'cancelled') {
    throw new ProviderError('provider-down', { message: `The interaction ${status}.` });
  }

  const native = built.filter((s) => s && s.type !== 'user_input');
  const parts: (TextPart | ToolCall)[] = [];
  for (const s of native) {
    if (s.type === 'model_output') {
      const text = list(s['content'])
        .map((c) => str(c, 'text') ?? '')
        .join('');
      if (text) parts.push({ type: 'text', text });
    }
    if (s.type === 'function_call') {
      parts.push({
        type: 'tool-call',
        id: str(s, 'id') ?? '',
        name: str(s, 'name') ?? '',
        input: obj(s, 'arguments') ?? {},
      });
    }
  }
  const turn: ModelTurn = { role: 'model', provider: 'google', model, parts, native };
  const stop: Stop = parts.some((p) => p.type === 'tool-call')
    ? 'tool-calls'
    : status === 'incomplete'
      ? 'max-tokens'
      : 'done';
  yield { type: 'end', turn, stop, usage: readUsage(completed) };
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function appendText(step: Step, text: string): void {
  const content = list(step['content']) as Record<string, unknown>[];
  const last = content.at(-1);
  if (last && last['type'] === 'text') last['text'] = `${str(last, 'text') ?? ''}${text}`;
  else content.push({ type: 'text', text });
  step['content'] = content;
}

function readUsage(interaction: Record<string, unknown>): Usage | null {
  const u = obj(interaction, 'usage');
  const input = num(u, 'total_input_tokens');
  const output = num(u, 'total_output_tokens');
  if (input === undefined || output === undefined) return null;
  return {
    input,
    cachedInput: num(u, 'total_cached_tokens') ?? 0,
    cacheWrite: 0,
    // Thinking is billed as output, and Google counts it separately.
    output: output + (num(u, 'total_thought_tokens') ?? 0),
  };
}

/**
 * Google's errors: a status name and, for keys, a reason. An invalid key is a 400 with the
 * reason API_KEY_INVALID. Google's ordinary rate-limit message also says "check your plan and
 * billing details", so only words that can mean nothing else count as being out of credit.
 */
function kindOf(status: number | undefined, error: unknown, message = ''): ProviderErrorKind {
  const details = (error as { details?: unknown } | undefined)?.details;
  const reasons = (Array.isArray(details) ? details : []).map((d) => str(d, 'reason'));
  const state = str(error, 'status');
  if (reasons.some((r) => r === 'API_KEY_INVALID' || r === 'API_KEY_SERVICE_BLOCKED'))
    return 'declined';
  if (/prepay|credit balance|out of credits?|billing (is )?(not enabled|disabled)/i.test(message)) {
    return 'no-credit';
  }
  if (
    status === 401 ||
    status === 403 ||
    state === 'PERMISSION_DENIED' ||
    state === 'UNAUTHENTICATED'
  ) {
    return 'declined';
  }
  if (status === 404 || state === 'NOT_FOUND') return 'model-gone';
  if (status === 429 || state === 'RESOURCE_EXHAUSTED') return 'rate-limited';
  if (status !== undefined && status >= 400 && status < 500) return 'bad-request';
  return 'provider-down';
}

function failure(status: number, text: string, headers: IncomingHttpHeaders): ProviderError {
  const error = obj(parseJson(text), 'error');
  const message = str(error, 'message');
  // Google says how long to wait inside the body, as RetryInfo's retryDelay ("37s").
  const retryInfo = (Array.isArray(error?.['details']) ? error['details'] : []).find((d) =>
    str(d, '@type')?.endsWith('RetryInfo'),
  );
  const delay = /^(\d+(?:\.\d+)?)s$/.exec(str(retryInfo, 'retryDelay') ?? '');
  return new ProviderError(kindOf(status, error, message), {
    status,
    retryAfterMs: delay ? Number(delay[1]) * 1000 : retryAfter(headers),
    message,
  });
}
