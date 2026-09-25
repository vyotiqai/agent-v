import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Sql } from '../db/connect.ts';
import { schemaVersion } from '../db/migrate.ts';
import { type LogFields, type Logger, METHODS, type Method, type Route } from '../log.ts';

/**
 * The API service: the app's only door (stage 6, section 3). Slice 0 has only what a deploy
 * needs: liveness and readiness. Each later slice adds its routes here.
 */

export interface ApiOptions {
  sql: Sql;
  logger: Logger;
  /** The schema version this code needs: the number of migrations it ships. */
  schema: number;
}

type Handler = (req: IncomingMessage) => Promise<{ status: number; body: unknown }>;

export function createApi({ sql, logger, schema }: ApiOptions): Server {
  const routes: Record<string, { route: Route; handler: Handler }> = {
    '/healthz': {
      route: 'healthz',
      handler: async () => ({ status: 200, body: { status: 'ok' } }),
    },
    '/readyz': {
      route: 'readyz',
      // Ready when the database answers and holds at least the schema this code needs. A newer
      // schema is fine: changes are made in two steps, so this code still works with it.
      handler: async () => {
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
  };

  return createServer((req, res) => {
    const started = performance.now();
    const path = (req.url ?? '/').split('?')[0] as string;
    const found = routes[path];
    const fields: LogFields = {
      route: found ? found.route : 'not-found',
      method: methodOf(req.method),
      ...traceOf(req),
    };
    const finish = (status: number, body: unknown): void => {
      send(res, status, body, req.method === 'HEAD');
      logger.log('api.request', { ...fields, status, durationMs: performance.now() - started });
    };
    if (!found) {
      finish(404, { error: 'not-found' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('allow', 'GET, HEAD');
      finish(405, { error: 'method-not-allowed' });
      return;
    }
    found.handler(req).then(
      (r) => finish(r.status, r.body),
      (err: unknown) => {
        logger.error('api.error', 'internal', err, fields);
        finish(500, { error: 'internal' });
      },
    );
  });
}

function send(res: ServerResponse, status: number, body: unknown, headOnly: boolean): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
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
