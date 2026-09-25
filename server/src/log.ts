import { isId } from './ids.ts';

/**
 * Content-free logging (stage 6, section 20, D112).
 *
 * A log line can hold only: an event name from the list below, ids, numbers, and values from
 * fixed lists. There is no field for free text, and error messages are never logged, since they
 * can repeat what a person wrote. So a person's content can't reach the logs by mistake: the
 * types refuse it when the code is written, and the checks below drop anything else at run time.
 *
 * Lines are JSON on standard output, in the shape Google Cloud Logging reads.
 */

/** Every event the server logs, with its severity. To log something new, add it here. */
export const EVENTS = {
  'process.start': 'INFO',
  'process.stop': 'INFO',
  'process.crash': 'ERROR',
  'api.request': 'INFO',
  'api.error': 'ERROR',
  'migrate.applied': 'INFO',
  'migrate.done': 'INFO',
  'migrate.failed': 'ERROR',
  'egress.tunnel': 'INFO',
  'egress.refused': 'WARNING',
  'egress.error': 'WARNING',
  'datakey.created': 'INFO',
  'datakey.destroyed': 'INFO',
  'auth.signed-in': 'INFO',
  'auth.failed': 'WARNING',
  'auth.token-reused': 'WARNING',
  'auth.signed-out': 'INFO',
  'auth.phone-signed-out': 'INFO',
  'api.rate-limited': 'WARNING',
  'ai.key-saved': 'INFO',
  'ai.key-refused': 'INFO',
  'ai.key-removed': 'INFO',
} as const;

export type EventName = keyof typeof EVENTS;
type Severity = (typeof EVENTS)[EventName];

/** The kinds of error there are. Logs say which kind, never the message. */
export const ERROR_KINDS = [
  'internal',
  'database',
  'timeout',
  'bad-request',
  'not-found',
  'private-address',
  'dns',
  'connect-failed',
  'migration-edited',
  'migration-unknown',
  'unauthorized',
  'sign-in-failed',
  'keys-unavailable',
  'rate-limited',
  // Why a provider refused a call (server/src/ai/types.ts).
  'declined',
  'no-credit',
  'model-gone',
  'provider-down',
  'unreachable',
  'address-not-allowed',
] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export const PROCESSES = ['api', 'worker', 'egress', 'migrate'] as const;
export type ProcessName = (typeof PROCESSES)[number];

/** The API's routes, by name rather than by path, so a path can never carry content into a log. */
export const ROUTES = [
  'healthz',
  'readyz',
  'auth-nonce',
  'auth-google',
  'auth-refresh',
  'auth-sign-out',
  'phones',
  'phone',
  'me',
  'me-time-zone',
  'ai',
  'ai-keys',
  'ai-key',
  'ai-key-check',
  'ai-models',
  'ai-limit',
  'ai-search-key',
  'not-found',
] as const;
export type Route = (typeof ROUTES)[number];

export const METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'CONNECT',
  'other',
] as const;
export type Method = (typeof METHODS)[number];

export interface LogFields {
  /** Ids: random UUIDs. */
  personId?: string;
  requestId?: string;
  /** Google Cloud's trace id, 32 hex characters. */
  traceId?: string;
  /** Numbers. */
  status?: number;
  durationMs?: number;
  count?: number;
  bytes?: number;
  version?: number;
  /** Values from fixed lists. */
  errorKind?: ErrorKind;
  process?: ProcessName;
  route?: Route;
  method?: Method;
  /** A Postgres error's SQLSTATE code, such as 42P01; never its message, which can hold values. */
  sqlState?: string;
  /** Where in our code an error happened: stack frames without the error's message. */
  frames?: string[];
}

const TRACE = /^[0-9a-f]{32}$/;
// One V8 stack frame: "at fn (file:///path.ts:12:5)", "at file:///path.ts:12:5" or a node: location.
const FRAME =
  /^at (?:(?:async )?[\w$.<>[\] ]{1,120} \()?(?:file:\/\/\/|node:|\/)[^()\s]{1,240}:\d+:\d+\)?$/;

const checks: { [K in keyof Required<LogFields>]: (v: unknown) => boolean } = {
  personId: (v) => typeof v === 'string' && isId(v),
  requestId: (v) => typeof v === 'string' && isId(v),
  traceId: (v) => typeof v === 'string' && TRACE.test(v),
  status: isCount,
  durationMs: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
  count: isCount,
  bytes: isCount,
  version: isCount,
  errorKind: (v) => (ERROR_KINDS as readonly unknown[]).includes(v),
  process: (v) => (PROCESSES as readonly unknown[]).includes(v),
  route: (v) => (ROUTES as readonly unknown[]).includes(v),
  method: (v) => (METHODS as readonly unknown[]).includes(v),
  sqlState: (v) => typeof v === 'string' && /^[0-9A-Z]{5}$/.test(v),
  frames: (v) =>
    Array.isArray(v) && v.length <= 12 && v.every((f) => typeof f === 'string' && FRAME.test(f)),
};

function isCount(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

export type Write = (line: string) => void;

export interface Logger {
  log(event: EventName, fields?: LogFields): void;
  /** Logs an error by kind, with the stack frames that show where it happened. */
  error(event: EventName, kind: ErrorKind, err: unknown, fields?: LogFields): void;
}

/**
 * Makes a logger. `project` is the Google Cloud project id, used to link lines to their trace;
 * `write` is where lines go (standard output unless a test passes its own).
 */
export function createLogger(options: { project?: string; write?: Write } = {}): Logger {
  const write: Write = options.write ?? ((line) => process.stdout.write(line));
  const log = (event: EventName, fields: LogFields = {}): void => {
    const severity: Severity | undefined = EVENTS[event];
    if (severity === undefined) return;
    const line: Record<string, unknown> = {
      severity,
      message: event,
      time: new Date().toISOString(),
    };
    const dropped: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      const check = (checks as Record<string, ((v: unknown) => boolean) | undefined>)[key];
      if (check?.(value)) line[key] = value;
      else dropped.push(check ? key : 'unknown-field');
    }
    if (dropped.length > 0) line['dropped'] = [...new Set(dropped)];
    const traceId = line['traceId'];
    if (typeof traceId === 'string' && options.project) {
      line['logging.googleapis.com/trace'] = `projects/${options.project}/traces/${traceId}`;
      delete line['traceId'];
    }
    write(`${JSON.stringify(line)}\n`);
  };
  return {
    log,
    error(event, kind, err, fields = {}) {
      const code = (err as { code?: unknown } | null)?.code;
      log(event, {
        ...fields,
        errorKind: kind,
        ...(typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? { sqlState: code } : {}),
        frames: stackFrames(err),
      });
    },
  };
}

/**
 * The frames at the end of an error's stack, without its message, which could hold content. Only
 * lines in V8's exact frame format count, and only the unbroken run of them at the end, so a line
 * of the message can't pass as a frame.
 */
export function stackFrames(err: unknown): string[] {
  if (!(err instanceof Error) || typeof err.stack !== 'string') return [];
  const lines = err.stack.split('\n').map((l) => l.trim());
  const frames: string[] = [];
  for (let i = lines.length - 1; i > 0; i--) {
    const line = lines[i] as string;
    if (!FRAME.test(line)) break;
    frames.unshift(line);
  }
  return frames.slice(0, 12);
}
