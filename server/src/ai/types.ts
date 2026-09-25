/**
 * What every AI provider client has in common (stage 6, section 5; D88): one shape for a
 * conversation, one for the streamed answer, and our own few kinds of failure. Each client turns
 * its provider's wire format into these and back; nothing above the clients knows which
 * provider it is talking to.
 */

/** The four wire formats. `compatible` is OpenAI's Chat Completions, as others speak it. */
export type Provider = 'anthropic' | 'openai' | 'google' | 'compatible';

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's input: an object schema. */
  parameters: Record<string, unknown>;
}

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCall {
  type: 'tool-call';
  /** The provider's id for the call; the result is matched to it. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  type: 'tool-result';
  callId: string;
  name: string;
  output: string;
  isError: boolean;
}

export interface UserTurn {
  role: 'user';
  parts: (TextPart | ToolResult)[];
}

/**
 * A model's turn, kept two ways. `parts` is what it said and which tools it called, in our own
 * words. `native` is exactly what the provider returned, sent back unchanged when the next call
 * goes to the same provider and model: providers require their thinking and reasoning (with its
 * signatures) back as they gave it. A different provider or model gets `parts` instead.
 */
export interface ModelTurn {
  role: 'model';
  provider: Provider;
  model: string;
  parts: (TextPart | ToolCall)[];
  native: unknown;
}

export type Turn = UserTurn | ModelTurn;

export interface ModelCall {
  model: string;
  system?: string;
  turns: Turn[];
  tools?: ToolSpec[];
  maxOutputTokens: number;
  signal?: AbortSignal;
}

/**
 * Tokens used by one call. `input` counts the whole prompt, including what was read from or
 * written to the provider's cache; `output` includes any thinking.
 */
export interface Usage {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
}

/** Why a model's turn ended. */
export type Stop =
  /** It finished what it had to say. */
  | 'done'
  /** It wants tools called; their results are the next turn. */
  | 'tool-calls'
  /** It ran out of the tokens it was allowed. */
  | 'max-tokens'
  /** It declined to answer. */
  | 'refused'
  /** The conversation no longer fits the model. */
  | 'context-full';

export type StreamEvent =
  /** More of the answer's text, as it is written. */
  | { type: 'text'; text: string }
  /**
   * The whole turn, once it is finished. Usage is null when the provider didn't report it (some
   * compatible servers don't), so no cost is shown rather than a wrong one.
   */
  | { type: 'end'; turn: ModelTurn; stop: Stop; usage: Usage | null };

export interface ModelInfo {
  /** The id calls use. */
  id: string;
  /** The provider's own name for it, for people. */
  name: string;
  /** Whether it can call tools, which jobs need; null when the provider doesn't say. */
  tools: boolean | null;
  contextTokens: number | null;
  maxOutputTokens: number | null;
}

/**
 * Our own kinds of failure (stage 6, section 5; J9). The first five are the ones a person is told
 * about; they drive the Needs you items.
 */
export type ProviderErrorKind =
  /** The key isn't valid, was revoked, or isn't allowed to do this. */
  | 'declined'
  /** The account behind the key has no credit or quota left. */
  | 'no-credit'
  | 'rate-limited'
  /** The model doesn't exist, or the key can't use it. */
  | 'model-gone'
  /** The provider answered, but with its own failure. */
  | 'provider-down'
  /** The provider couldn't be reached at all. */
  | 'unreachable'
  /** A custom endpoint's address is not on the public internet, or isn't https. */
  | 'address-not-allowed'
  /** The provider refused the request itself: our mistake, or a conversation too long for it. */
  | 'bad-request';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  /** The HTTP status, when the provider answered with one. */
  readonly status: number | undefined;
  /** How long the provider asked us to wait, when it said. */
  readonly retryAfterMs: number | undefined;
  constructor(
    kind: ProviderErrorKind,
    details: { status?: number; retryAfterMs?: number; message?: string; cause?: unknown } = {},
  ) {
    // The provider's own message is kept for tests and debugging only; logs carry the kind.
    super(details.message ?? kind, { cause: details.cause });
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = details.status;
    this.retryAfterMs = details.retryAfterMs;
  }
}

export interface ProviderClient {
  readonly provider: Provider;
  /** Calls the model and streams its answer; the last event is always `end`, or it throws. */
  stream(key: string, call: ModelCall): AsyncGenerator<StreamEvent>;
  /** The models the key can use. */
  models(key: string, signal?: AbortSignal): Promise<ModelInfo[]>;
}
