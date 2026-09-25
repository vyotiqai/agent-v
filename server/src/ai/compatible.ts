import { createHash } from 'node:crypto';
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
 * OpenAI's Chat Completions format, as the other providers speak it (stage 6, section 5):
 * OpenRouter, Groq, Together, Mistral, DeepSeek, xAI, and self-hosted servers. `baseUrl` is the
 * address the person gave, such as https://openrouter.ai/api/v1.
 *
 * They follow the format closely but not exactly, so this client reads defensively: errors can
 * arrive in the middle of a stream, usage may never arrive, and a tool call may come whole or in
 * fragments, with or without its index.
 */
export function compatibleClient(egress: Egress, baseUrl: string): ProviderClient {
  const base = baseUrl.replace(/\/+$/, '');
  const headers = (key: string) => ({
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  });

  return {
    provider: 'compatible',

    async *stream(key, call) {
      const res = await send(egress, `${base}/chat/completions`, {
        method: 'POST',
        headers: { ...headers(key), accept: 'text/event-stream' },
        body: JSON.stringify(requestBody(call)),
        signal: call.signal,
      });
      if (res.status !== 200) throw failure(res.status, await readText(res), res.headers);
      yield* readStream(events(res, call.signal), call.model);
    },

    async models(key, signal) {
      const res = await send(egress, `${base}/models`, { headers: headers(key), signal });
      const text = await readText(res);
      if (res.status !== 200) throw failure(res.status, text, res.headers);
      const body = parseJson(text) as { data?: unknown } | unknown[] | null;
      // Most wrap the list in `data`; some send the list alone.
      const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      const out: ModelInfo[] = [];
      for (const m of list) {
        const id = str(m, 'id');
        if (!id) continue;
        out.push({
          id,
          name: str(m, 'name') ?? str(m, 'display_name') ?? id,
          tools: toolSupport(m),
          contextTokens:
            num(m, 'context_length') ?? num(m, 'context_window') ?? num(m, 'max_model_len') ?? null,
          maxOutputTokens:
            num(obj(m, 'top_provider'), 'max_completion_tokens') ??
            num(m, 'max_completion_tokens') ??
            null,
        });
      }
      return out;
    },
  };
}

/** OpenRouter lists each model's parameters; Mistral says whether it can call functions. */
function toolSupport(model: unknown): boolean | null {
  const params = (model as { supported_parameters?: unknown }).supported_parameters;
  if (Array.isArray(params)) return params.includes('tools');
  const calling = obj(model, 'capabilities')?.['function_calling'];
  return typeof calling === 'boolean' ? calling : null;
}

function requestBody(call: ModelCall): Record<string, unknown> {
  return {
    model: call.model,
    messages: [
      ...(call.system ? [{ role: 'system', content: call.system }] : []),
      ...messages(call.turns, call.model),
    ],
    ...(call.tools?.length
      ? {
          tools: call.tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }
      : {}),
    // Every compatible server takes max_tokens; OpenAI's own models, which take only
    // max_completion_tokens, are called through the Responses API instead.
    max_tokens: call.maxOutputTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
}

function messages(turns: Turn[], model: string): unknown[] {
  // Tool call ids from another provider's turns are given new ones that every server accepts
  // (Mistral's are exactly nine letters and digits); their results follow them.
  const renamed = new Map<string, string>();
  const out: unknown[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      for (const p of turn.parts) {
        if (p.type === 'tool-result') {
          out.push({
            role: 'tool',
            tool_call_id: renamed.get(p.callId) ?? p.callId,
            content: p.isError ? `Error: ${p.output}` : p.output,
          });
        }
      }
      const text = turn.parts
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.text)
        .join('\n\n');
      if (text) out.push({ role: 'user', content: text });
      continue;
    }
    if (turn.provider === 'compatible' && turn.model === model && turn.native) {
      out.push(turn.native);
      continue;
    }
    const calls = turn.parts.filter((p): p is ToolCall => p.type === 'tool-call');
    for (const c of calls) renamed.set(c.id, portableId(c.id));
    const text = turn.parts
      .filter((p): p is TextPart => p.type === 'text')
      .map((p) => p.text)
      .join('');
    out.push({
      role: 'assistant',
      content: text || null,
      ...(calls.length
        ? {
            tool_calls: calls.map((c) => ({
              id: renamed.get(c.id),
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.input) },
            })),
          }
        : {}),
    });
  }
  return out;
}

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Nine letters and digits, the same for the same id. */
function portableId(id: string): string {
  const digest = createHash('sha256').update(id).digest();
  let out = '';
  for (let i = 0; i < 9; i++) out += ALPHANUMERIC[(digest[i] as number) % ALPHANUMERIC.length];
  return out;
}

interface PendingCall {
  id: string;
  name: string;
  args: string;
}

async function* readStream(
  stream: AsyncGenerator<{ event: string; data: string }>,
  model: string,
): AsyncGenerator<StreamEvent> {
  let text = '';
  // Reasoning comes as `reasoning_content` (DeepSeek, older vLLM) or `reasoning` (OpenRouter, Groq).
  let reasoning = '';
  let reasoningField: 'reasoning_content' | 'reasoning' = 'reasoning_content';
  const calls: PendingCall[] = [];
  const byIndex = new Map<number, PendingCall>();
  let finish: string | undefined;
  let usage: Usage | null = null;
  let done = false;

  for await (const { data } of stream) {
    if (data === '[DONE]') {
      done = true;
      break;
    }
    const chunk = parseJson(data) as Record<string, unknown> | null;
    if (!chunk) continue;
    if (chunk['error']) throw streamError(chunk['error']);
    usage = readUsage(chunk) ?? usage;
    const choice = (Array.isArray(chunk['choices']) ? chunk['choices'][0] : undefined) as
      | Record<string, unknown>
      | undefined;
    if (!choice) continue;
    const delta = obj(choice, 'delta');
    const content = str(delta, 'content');
    if (content) {
      text += content;
      yield { type: 'text', text: content };
    }
    for (const field of ['reasoning_content', 'reasoning'] as const) {
      const piece = str(delta, field);
      if (piece) {
        reasoning += piece;
        reasoningField = field;
      }
    }
    const fragments = delta?.['tool_calls'];
    for (const f of Array.isArray(fragments) ? fragments : []) {
      const index = num(f, 'index');
      const id = str(f, 'id');
      const fn = obj(f, 'function');
      let call = index === undefined ? undefined : byIndex.get(index);
      // Without an index, a new id starts a new call; anything else continues the last one.
      if (!call && index === undefined && !id) call = calls.at(-1);
      if (!call) {
        call = { id: '', name: '', args: '' };
        calls.push(call);
        if (index !== undefined) byIndex.set(index, call);
      }
      if (id) call.id = id;
      const name = str(fn, 'name');
      if (name) call.name = name;
      call.args += str(fn, 'arguments') ?? '';
    }
    const reason = str(choice, 'finish_reason');
    if (reason === 'error')
      throw new ProviderError('provider-down', { message: 'The stream failed.' });
    if (reason) finish = reason;
  }
  // A server that doesn't send [DONE] still ends properly once it has said why it stopped.
  if (!done && finish === undefined) {
    throw new ProviderError('provider-down', { message: 'The answer stopped before its end.' });
  }

  const toolCalls: ToolCall[] = calls.map((c, i) => ({
    type: 'tool-call',
    id: c.id || `call_${i + 1}`,
    name: c.name,
    input: toolInput(c.args),
  }));
  const native: Record<string, unknown> = {
    role: 'assistant',
    content: text || null,
    ...(toolCalls.length
      ? {
          tool_calls: toolCalls.map((c, i) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: calls[i]?.args || '{}' },
          })),
        }
      : {}),
    // DeepSeek requires its reasoning back on later calls; it came from this server, so it is
    // accepted there.
    ...(reasoning ? { [reasoningField]: reasoning } : {}),
  };
  const parts: (TextPart | ToolCall)[] = [
    ...(text ? [{ type: 'text' as const, text }] : []),
    ...toolCalls,
  ];
  const turn: ModelTurn = { role: 'model', provider: 'compatible', model, parts, native };
  yield { type: 'end', turn, stop: stopOf(toolCalls.length > 0, finish), usage };
}

// The tool calls decide, not the finish reason: some servers say "stop" after calling tools.
function stopOf(calledTools: boolean, finish: string | undefined): Stop {
  if (calledTools) return 'tool-calls';
  if (finish === 'length') return 'max-tokens';
  if (finish === 'content_filter') return 'refused';
  return 'done';
}

/** Usage, wherever this server puts it: in `usage`, or Groq's older `x_groq.usage`. */
function readUsage(chunk: Record<string, unknown>): Usage | null {
  const u = obj(chunk, 'usage') ?? obj(obj(chunk, 'x_groq'), 'usage');
  const input = num(u, 'prompt_tokens');
  const output = num(u, 'completion_tokens');
  if (input === undefined || output === undefined) return null;
  const details = obj(u, 'prompt_tokens_details');
  return {
    input,
    cachedInput: num(details, 'cached_tokens') ?? num(u, 'prompt_cache_hit_tokens') ?? 0,
    cacheWrite: num(details, 'cache_write_tokens') ?? 0,
    output,
  };
}

/** The error shapes of OpenAI and the servers that copy it, which differ in the details. */
export function openaiKind(status: number | undefined, error: unknown): ProviderErrorKind {
  const code = (error as Record<string, unknown> | null)?.['code'];
  const type = str(error, 'type');
  const message = str(error, 'message') ?? '';
  const effective = status ?? (typeof code === 'number' ? code : undefined);
  if (code === 'insufficient_quota' || type === 'insufficient_quota' || effective === 402) {
    return 'no-credit';
  }
  if (code === 'invalid_api_key' || effective === 401 || effective === 403) return 'declined';
  if (code === 'model_not_found' || effective === 404) return 'model-gone';
  if (code === 'rate_limit_exceeded' || effective === 429) return 'rate-limited';
  if (/insufficient (credits|balance|funds)/i.test(message)) return 'no-credit';
  if (effective !== undefined && effective >= 400 && effective < 500) return 'bad-request';
  return 'provider-down';
}

function errorOf(body: unknown): unknown {
  const e = (body as Record<string, unknown> | null)?.['error'];
  if (e && typeof e === 'object') return e;
  // Some servers send `{"error": "message"}`, or the error's fields with no wrapper at all.
  if (typeof e === 'string') return { message: e };
  return body;
}

export function failure(status: number, text: string, headers: IncomingHttpHeaders): ProviderError {
  const error = errorOf(parseJson(text));
  return new ProviderError(openaiKind(status, error), {
    status,
    retryAfterMs: retryAfter(headers),
    message: str(error, 'message'),
  });
}

function streamError(error: unknown): ProviderError {
  const e = typeof error === 'string' ? { message: error } : error;
  return new ProviderError(openaiKind(undefined, e), { message: str(e, 'message') });
}
