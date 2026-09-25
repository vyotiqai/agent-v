import type { IncomingHttpHeaders } from 'node:http';
import {
  type Egress,
  EgressError,
  type EgressRequest,
  type EgressResponse,
} from '../egress/client.ts';
import { readEvents, type ServerEvent } from './sse.ts';
import { ProviderError } from './types.ts';

/** What the clients share: calling through the gateway, reading answers, and failures. */

/** An error body, or a model list, is never allowed to be larger than this. */
const MAX_BODY = 4 * 1024 * 1024;

/** Makes the call; a call that can't be made becomes our own kind of failure. */
export async function send(
  egress: Egress,
  url: string,
  init: EgressRequest,
): Promise<EgressResponse> {
  try {
    return await egress(url, init);
  } catch (err) {
    throw asProviderError(err, init.signal);
  }
}

/** Reads a whole body as text, up to a limit. */
export async function readText(res: EgressResponse, limit = MAX_BODY): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of res.body) {
      size += chunk.byteLength;
      if (size > limit) {
        res.cancel();
        throw new ProviderError('provider-down', { message: 'The answer is larger than allowed.' });
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (err) {
    throw asProviderError(err);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Parses JSON, or gives null for anything that isn't. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The events of a streamed answer; a stream that breaks becomes our own kind of failure. */
export async function* events(
  res: EgressResponse,
  signal?: AbortSignal,
): AsyncGenerator<ServerEvent> {
  try {
    yield* readEvents(res.body);
  } catch (err) {
    throw asProviderError(err, signal);
  } finally {
    res.cancel();
  }
}

/**
 * How long the provider asked us to wait: `retry-after-ms` (Anthropic, OpenAI), or
 * `retry-after` in seconds or as a date (RFC 9110, section 10.2.3).
 */
export function retryAfter(headers: IncomingHttpHeaders, now = Date.now()): number | undefined {
  const ms = Number(headers['retry-after-ms']);
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const value = headers['retry-after'];
  if (typeof value !== 'string' || value === '') return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** A string field of an object, if it is one. */
export function str(value: unknown, key: string): string | undefined {
  const v = (value as Record<string, unknown> | null)?.[key];
  return typeof v === 'string' ? v : undefined;
}

/** A number field of an object, if it is one. */
export function num(value: unknown, key: string): number | undefined {
  const v = (value as Record<string, unknown> | null)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** An object field of an object, if it is one. */
export function obj(value: unknown, key: string): Record<string, unknown> | undefined {
  const v = (value as Record<string, unknown> | null)?.[key];
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/** Parses a tool call's arguments, which must be a JSON object. */
export function toolInput(json: string): Record<string, unknown> {
  if (json.trim() === '') return {};
  const value = parseJson(json);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProviderError('provider-down', {
      message: "A tool call's input isn't a JSON object.",
    });
  }
  return value as Record<string, unknown>;
}

function asProviderError(err: unknown, signal?: AbortSignal): unknown {
  if (signal?.aborted) return signal.reason;
  if (err instanceof ProviderError) return err;
  if (err instanceof EgressError) {
    const kind =
      err.kind === 'private-address' || err.kind === 'bad-address'
        ? 'address-not-allowed'
        : 'unreachable';
    return new ProviderError(kind, { message: err.message, cause: err });
  }
  return new ProviderError('unreachable', { cause: err });
}
