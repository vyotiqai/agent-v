import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { type ApiErrorCode, parseGoogleSignIn, parseRefresh } from '@agentv/shared/accounts.ts';
import {
  parseAddKey,
  parseChooseModels,
  parseLimit,
  parseSearchKey,
  parseTimeZone,
} from '@agentv/shared/ai.ts';
import {
  type AiDeps,
  addKey,
  aiView,
  checkKey,
  chooseModels,
  me,
  type Outcome,
  removeKey,
  removeSearchKey,
  setLimit,
  setSearchKey,
  setTimeZone,
} from '../ai/keys.ts';
import {
  authenticate,
  BadSigningKey,
  type Caller,
  newNonce,
  phones,
  refresh,
  SignedOut,
  signInWithGoogle,
  signOut,
  signOutPhone,
  useNonce,
} from '../auth/accounts.ts';
import { KeysUnavailable, type VerifyGoogle } from '../auth/google.ts';
import { TokenError } from '../auth/jwt.ts';
import type { Sql } from '../db/connect.ts';
import { schemaVersion } from '../db/migrate.ts';
import { isId } from '../ids.ts';
import {
  type ErrorKind,
  type LogFields,
  type Logger,
  METHODS,
  type Method,
  type Route,
} from '../log.ts';
import { addressKey, allow } from '../ratelimit.ts';

/**
 * The API service: the app's only door (stage 6, section 3). Our own small router: each route has
 * a method, a path, a name for the logs, and whether it needs a signed-in phone.
 */

export interface ApiOptions {
  sql: Sql;
  logger: Logger;
  /** The schema version this code needs: the number of migrations it ships. */
  schema: number;
  verifyGoogle: VerifyGoogle;
  /** Your AI's outside parts: the data keys, the provider clients and search. */
  ai: Omit<AiDeps, 'sql' | 'logger'>;
}

interface Context {
  req: IncomingMessage;
  params: string[];
  body: unknown;
  caller: Caller | null;
  address: string;
}

type Reply = { status: number; body?: unknown };

interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: RegExp;
  name: Route;
  signedIn: boolean;
  handle: (ctx: Context) => Promise<Reply>;
}

const MAX_BODY = 16 * 1024;

const fail = (status: number, error: ApiErrorCode): Reply => ({ status, body: { error } });

export function createApi({ sql, logger, schema, verifyGoogle, ai }: ApiOptions): Server {
  const aiDeps: AiDeps = { sql, logger, ...ai };
  const limited = async (ctx: Context, scope: string, limit: number): Promise<boolean> => {
    if (await allow(sql, addressKey(scope, ctx.address), limit)) return false;
    logger.log('api.rate-limited', { errorKind: 'rate-limited' });
    return true;
  };
  // Checking a key makes a paid call to the person's provider: at most 10 a minute each.
  const checksLimited = async (caller: Caller): Promise<boolean> => {
    if (await allow(sql, `key-check:${caller.personId}`, 10)) return false;
    logger.log('api.rate-limited', { errorKind: 'rate-limited' });
    return true;
  };
  const outcome = (o: Outcome): Reply =>
    o.ok
      ? { status: 200, body: o.view }
      : { status: 422, body: { error: 'key-refused', problem: o.problem } };
  const view = async (ctx: Context): Promise<Reply> => ({
    status: 200,
    body: await aiView(sql, (ctx.caller as Caller).personId),
  });

  const routes: RouteDef[] = [
    {
      method: 'GET',
      path: /^\/healthz$/,
      name: 'healthz',
      signedIn: false,
      handle: async () => ({ status: 200, body: { status: 'ok' } }),
    },
    {
      method: 'GET',
      path: /^\/readyz$/,
      name: 'readyz',
      signedIn: false,
      // Ready when the database answers and holds at least the schema this code needs. A newer
      // schema is fine: changes are made in two steps, so this code still works with it.
      handle: async () => {
        try {
          const version = await schemaVersion(sql);
          return version >= schema
            ? { status: 200, body: { status: 'ready' } }
            : { status: 503, body: { status: 'not-ready', reason: 'schema' } };
        } catch (err) {
          logger.error('api.error', 'database', err, { route: 'readyz' });
          return { status: 503, body: { status: 'not-ready', reason: 'database' } };
        }
      },
    },
    {
      method: 'POST',
      path: /^\/v1\/auth\/nonce$/,
      name: 'auth-nonce',
      signedIn: false,
      handle: async (ctx) => {
        if (await limited(ctx, 'sign-in', 20)) return fail(429, 'too-many-requests');
        return { status: 200, body: { nonce: await newNonce(sql) } };
      },
    },
    {
      method: 'POST',
      path: /^\/v1\/auth\/google$/,
      name: 'auth-google',
      signedIn: false,
      handle: async (ctx) => {
        if (await limited(ctx, 'sign-in', 20)) return fail(429, 'too-many-requests');
        const request = parseGoogleSignIn(ctx.body);
        if (!request) return fail(400, 'bad-request');
        let who: Awaited<ReturnType<VerifyGoogle>>;
        try {
          who = await verifyGoogle(request.idToken, request.nonce);
        } catch (err) {
          if (err instanceof TokenError) return signInFailed();
          if (err instanceof KeysUnavailable) {
            logger.error('api.error', 'keys-unavailable', err, { route: 'auth-google' });
            return fail(503, 'internal');
          }
          throw err;
        }
        // The nonce inside Google's token must be one we gave out and nobody has used yet.
        if (!(await useNonce(sql, request.nonce))) return signInFailed();
        try {
          return { status: 200, body: await signInWithGoogle(sql, logger, who, request.phone) };
        } catch (err) {
          if (err instanceof BadSigningKey) return fail(400, 'bad-request');
          throw err;
        }
      },
    },
    {
      method: 'POST',
      path: /^\/v1\/auth\/refresh$/,
      name: 'auth-refresh',
      signedIn: false,
      handle: async (ctx) => {
        if (await limited(ctx, 'refresh', 60)) return fail(429, 'too-many-requests');
        const request = parseRefresh(ctx.body);
        if (!request) return fail(400, 'bad-request');
        try {
          return { status: 200, body: await refresh(sql, logger, request.refreshToken) };
        } catch (err) {
          if (err instanceof SignedOut) return fail(401, 'signed-out');
          throw err;
        }
      },
    },
    {
      method: 'POST',
      path: /^\/v1\/auth\/sign-out$/,
      name: 'auth-sign-out',
      signedIn: true,
      handle: async (ctx) => {
        await signOut(sql, logger, ctx.caller as Caller);
        return { status: 204 };
      },
    },
    {
      method: 'GET',
      path: /^\/v1\/phones$/,
      name: 'phones',
      signedIn: true,
      handle: async (ctx) => ({
        status: 200,
        body: { phones: await phones(sql, ctx.caller as Caller) },
      }),
    },
    {
      method: 'DELETE',
      path: /^\/v1\/phones\/([^/]+)$/,
      name: 'phone',
      signedIn: true,
      handle: async (ctx) => {
        const id = ctx.params[0] ?? '';
        if (!isId(id)) return fail(404, 'not-found');
        return (await signOutPhone(sql, logger, ctx.caller as Caller, id))
          ? { status: 204 }
          : fail(404, 'not-found');
      },
    },
    {
      method: 'GET',
      path: /^\/v1\/me$/,
      name: 'me',
      signedIn: true,
      handle: async (ctx) => ({
        status: 200,
        body: await me(sql, (ctx.caller as Caller).personId),
      }),
    },
    {
      method: 'PUT',
      path: /^\/v1\/me\/time-zone$/,
      name: 'me-time-zone',
      signedIn: true,
      handle: async (ctx) => {
        const request = parseTimeZone(ctx.body);
        if (!request) return fail(400, 'bad-request');
        const ok = await setTimeZone(sql, (ctx.caller as Caller).personId, request.timeZone);
        return ok ? { status: 204 } : fail(400, 'bad-request');
      },
    },
    {
      method: 'GET',
      path: /^\/v1\/ai$/,
      name: 'ai',
      signedIn: true,
      handle: view,
    },
    {
      method: 'POST',
      path: /^\/v1\/ai\/keys$/,
      name: 'ai-keys',
      signedIn: true,
      handle: async (ctx) => {
        const caller = ctx.caller as Caller;
        if (await checksLimited(caller)) return fail(429, 'too-many-requests');
        const request = parseAddKey(ctx.body);
        if (!request) return fail(400, 'bad-request');
        return outcome(await addKey(aiDeps, caller.personId, request));
      },
    },
    {
      method: 'DELETE',
      path: /^\/v1\/ai\/keys\/([^/]+)$/,
      name: 'ai-key',
      signedIn: true,
      handle: async (ctx) => {
        const id = ctx.params[0] ?? '';
        if (!isId(id)) return fail(404, 'not-found');
        const removed = await removeKey(aiDeps, (ctx.caller as Caller).personId, id);
        return removed ? view(ctx) : fail(404, 'not-found');
      },
    },
    {
      method: 'POST',
      path: /^\/v1\/ai\/keys\/([^/]+)\/check$/,
      name: 'ai-key-check',
      signedIn: true,
      handle: async (ctx) => {
        const caller = ctx.caller as Caller;
        const id = ctx.params[0] ?? '';
        if (!isId(id)) return fail(404, 'not-found');
        if (await checksLimited(caller)) return fail(429, 'too-many-requests');
        const checked = await checkKey(aiDeps, caller.personId, id);
        return checked ? outcome(checked) : fail(404, 'not-found');
      },
    },
    {
      method: 'PUT',
      path: /^\/v1\/ai\/models$/,
      name: 'ai-models',
      signedIn: true,
      handle: async (ctx) => {
        const request = parseChooseModels(ctx.body);
        if (!request) return fail(400, 'bad-request');
        const chosen = await chooseModels(sql, (ctx.caller as Caller).personId, request);
        return chosen === 'ok' ? view(ctx) : fail(400, 'bad-request');
      },
    },
    {
      method: 'PUT',
      path: /^\/v1\/ai\/limit$/,
      name: 'ai-limit',
      signedIn: true,
      handle: async (ctx) => {
        const request = parseLimit(ctx.body);
        if (!request) return fail(400, 'bad-request');
        await setLimit(sql, (ctx.caller as Caller).personId, request.monthlyLimitCents);
        return view(ctx);
      },
    },
    {
      method: 'PUT',
      path: /^\/v1\/ai\/search-key$/,
      name: 'ai-search-key',
      signedIn: true,
      handle: async (ctx) => {
        const caller = ctx.caller as Caller;
        if (await checksLimited(caller)) return fail(429, 'too-many-requests');
        const request = parseSearchKey(ctx.body);
        if (!request) return fail(400, 'bad-request');
        return outcome(await setSearchKey(aiDeps, caller.personId, request.key));
      },
    },
    {
      method: 'DELETE',
      path: /^\/v1\/ai\/search-key$/,
      name: 'ai-search-key',
      signedIn: true,
      handle: async (ctx) => {
        await removeSearchKey(aiDeps, (ctx.caller as Caller).personId);
        return view(ctx);
      },
    },
  ];

  function signInFailed(): Reply {
    logger.log('auth.failed', { errorKind: 'sign-in-failed' });
    return fail(401, 'sign-in-failed');
  }

  return createServer((req, res) => {
    const started = performance.now();
    const path = (req.url ?? '/').split('?')[0] as string;
    const fields: LogFields = { method: methodOf(req.method), ...traceOf(req) };
    const finish = (reply: Reply): void => {
      send(res, reply, req.method === 'HEAD');
      logger.log('api.request', {
        ...fields,
        status: reply.status,
        durationMs: performance.now() - started,
      });
    };
    const onPath = routes.filter((r) => r.path.test(path));
    const route = onPath.find(
      (r) => r.method === req.method || (r.method === 'GET' && req.method === 'HEAD'),
    );
    fields.route = (route ?? onPath[0])?.name ?? 'not-found';
    if (onPath.length === 0) {
      finish(fail(404, 'not-found'));
      return;
    }
    if (!route) {
      const methods = onPath.flatMap((r) => (r.method === 'GET' ? ['GET', 'HEAD'] : [r.method]));
      res.setHeader('allow', [...new Set(methods)].join(', '));
      finish(fail(405, 'method-not-allowed'));
      return;
    }
    run(route, req, path)
      .then(finish)
      .catch((err: unknown) => {
        const kind: ErrorKind = err instanceof BodyError ? 'bad-request' : 'internal';
        if (kind === 'internal') logger.error('api.error', kind, err, fields);
        finish(kind === 'bad-request' ? fail(400, 'bad-request') : fail(500, 'internal'));
      });
  });

  async function run(route: RouteDef, req: IncomingMessage, path: string): Promise<Reply> {
    const ctx: Context = {
      req,
      params: (route.path.exec(path) ?? []).slice(1),
      body: req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : null,
      caller: null,
      address: clientAddress(req),
    };
    if (route.signedIn) {
      const bearer = /^Bearer ([A-Za-z0-9_-]{1,100})$/.exec(req.headers.authorization ?? '');
      ctx.caller = bearer ? await authenticate(sql, bearer[1] as string) : null;
      if (!ctx.caller) return fail(401, 'unauthorized');
    }
    return route.handle(ctx);
  }
}

class BodyError extends Error {}

/** A JSON body of at most 16 KB, or nothing. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new BodyError();
    chunks.push(chunk);
  }
  if (size === 0) return null;
  if (!/^application\/json\b/.test(req.headers['content-type'] ?? '')) throw new BodyError();
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BodyError();
  }
}

/**
 * The caller's network address, for rate limits. Behind Cloud Run, Google's front end appends the
 * address it saw to X-Forwarded-For, so the last entry is the one no client can forge.
 */
function clientAddress(req: IncomingMessage): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return forwarded.at(-1) ?? req.socket.remoteAddress ?? 'unknown';
}

function send(res: ServerResponse, reply: Reply, headOnly: boolean): void {
  const headers: Record<string, string | number> = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (reply.status === 401) headers['www-authenticate'] = 'Bearer';
  if (reply.body === undefined) {
    res.writeHead(reply.status, headers).end();
    return;
  }
  const text = JSON.stringify(reply.body);
  headers['content-type'] = 'application/json; charset=utf-8';
  headers['content-length'] = Buffer.byteLength(text);
  res.writeHead(reply.status, headers);
  res.end(headOnly ? undefined : text);
}

function methodOf(method: string | undefined): Method {
  return (METHODS as readonly string[]).includes(method ?? '') ? (method as Method) : 'other';
}

/** Cloud Run passes the trace as `traceparent` (W3C) or `X-Cloud-Trace-Context`. */
function traceOf(req: IncomingMessage): { traceId?: string } {
  const w3c = /^[0-9a-f]{2}-([0-9a-f]{32})-/.exec(String(req.headers['traceparent'] ?? ''));
  const cloud = /^([0-9a-f]{32})\//.exec(String(req.headers['x-cloud-trace-context'] ?? ''));
  const id = w3c?.[1] ?? cloud?.[1];
  return id ? { traceId: id } : {};
}
