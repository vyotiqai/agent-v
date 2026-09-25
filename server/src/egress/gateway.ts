import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { connect as netConnect, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import type { ErrorKind, Logger } from '../log.ts';
import { type Resolved, resolvePublic } from './address.ts';

/**
 * The egress gateway (stage 6, sections 5 and 7): a small forward proxy of our own. The cloud
 * browsers, and anything else that fetches on someone's behalf, reach the internet only through
 * it. For every connection it resolves the name, refuses unless every address is public, and
 * connects to the address it checked, so the name can't be re-pointed between check and connect.
 *
 * - HTTPS (and anything else over TLS) arrives as CONNECT host:port and is tunnelled unread.
 * - Plain HTTP arrives as a request for an absolute URL and is forwarded as it is. Redirects are
 *   passed back to the client, never followed here, so each hop is checked on its own.
 * - A refusal is an HTTP status with an `X-Egress-Refused` header naming the kind (for example
 *   `private-address`), which clients turn into an error kind.
 * - Nothing about where anyone went is logged: only kinds, durations and byte counts.
 */

export interface GatewayOptions {
  logger: Logger;
  /** How a host is checked. Tests pass their own; everything else uses the public-address rule. */
  resolve?: (host: string) => Promise<Resolved>;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
}

type Refusal = Extract<
  ErrorKind,
  'private-address' | 'dns' | 'connect-failed' | 'timeout' | 'bad-request'
>;

const STATUS: Record<Refusal, number> = {
  'private-address': 403,
  dns: 502,
  'connect-failed': 502,
  timeout: 504,
  'bad-request': 400,
};

const REASON: Record<number, string> = {
  400: 'Bad Request',
  403: 'Forbidden',
  502: 'Bad Gateway',
  504: 'Gateway Timeout',
};

// Headers that belong to one hop and are never passed on (RFC 9110, section 7.6.1).
const HOP = new Set([
  'connection',
  'proxy-connection',
  'keep-alive',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function createGateway(options: GatewayOptions): Server {
  const { logger } = options;
  const resolve = options.resolve ?? ((host: string) => resolvePublic(host));
  const connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 120_000;

  const refuse = (kind: Refusal, method: 'CONNECT' | 'other' | 'GET'): void => {
    logger.log(kind === 'private-address' ? 'egress.refused' : 'egress.error', {
      errorKind: kind,
      method,
    });
  };

  // A request that fails in a way nothing below expects ends that request, never the gateway.
  const server = createServer((req, res) => {
    forward(req, res).catch(() => {
      refuse('bad-request', 'other');
      if (!res.headersSent) reply(res, 'bad-request');
      else res.destroy();
    });
  });

  async function forward(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '';
    if (url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      reply(res, 'bad-request');
      return;
    }
    if (target.protocol !== 'http:' || target.username || target.password) {
      reply(res, 'bad-request');
      return;
    }
    const method = req.method === 'GET' ? 'GET' : 'other';
    const resolved = await resolve(target.hostname);
    if (!resolved.ok) {
      refuse(resolved.kind, method);
      reply(res, resolved.kind);
      return;
    }
    const started = performance.now();
    const upstream = httpRequest({
      host: resolved.address,
      port: target.port === '' ? 80 : Number(target.port),
      method: req.method,
      path: `${target.pathname}${target.search}`,
      headers: { ...passOn(req.headers), host: target.host },
      setHost: false,
      timeout: connectTimeoutMs,
    });
    upstream.on('timeout', () => upstream.destroy(new TimeoutError()));
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    upstream.on('response', (up) => {
      res.writeHead(up.statusCode ?? 502, passOn(up.headers));
      up.pipe(res);
      up.on('end', () => {
        logger.log('egress.tunnel', {
          method,
          status: up.statusCode ?? 0,
          durationMs: performance.now() - started,
        });
      });
    });
    upstream.on('error', (err) => {
      const kind: Refusal = err instanceof TimeoutError ? 'timeout' : 'connect-failed';
      refuse(kind, method);
      if (!res.headersSent) reply(res, kind);
      else res.destroy();
    });
    req.pipe(upstream);
  }

  server.on('connect', (req: IncomingMessage, client: Duplex, head: Buffer) => {
    tunnel(req, client as Socket, head).catch(() => {
      refuse('bad-request', 'CONNECT');
      client.destroy();
    });
  });

  async function tunnel(req: IncomingMessage, client: Socket, head: Buffer): Promise<void> {
    client.on('error', () => client.destroy());
    const target = parseAuthority(req.url ?? '');
    if (!target) {
      endWith(client, 'bad-request');
      return;
    }
    const resolved = await resolve(target.host);
    if (!resolved.ok) {
      refuse(resolved.kind, 'CONNECT');
      endWith(client, resolved.kind);
      return;
    }
    const started = performance.now();
    const upstream = netConnect({ host: resolved.address, port: target.port });
    let established = false;
    const timer = setTimeout(() => upstream.destroy(new TimeoutError()), connectTimeoutMs);
    upstream.once('connect', () => {
      clearTimeout(timer);
      established = true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
      for (const s of [client, upstream]) {
        s.setTimeout(idleTimeoutMs, () => {
          client.destroy();
          upstream.destroy();
        });
      }
    });
    upstream.on('error', (err) => {
      clearTimeout(timer);
      if (established) {
        client.destroy();
        return;
      }
      const kind: Refusal = err instanceof TimeoutError ? 'timeout' : 'connect-failed';
      refuse(kind, 'CONNECT');
      endWith(client, kind);
    });
    upstream.on('close', () => {
      client.destroy();
      if (upstream.bytesRead + upstream.bytesWritten > 0) {
        logger.log('egress.tunnel', {
          method: 'CONNECT',
          bytes: upstream.bytesRead + upstream.bytesWritten,
          durationMs: performance.now() - started,
        });
      }
    });
    client.on('close', () => upstream.destroy());
  }

  return server;
}

class TimeoutError extends Error {}

/** "host:port" or "[v6]:port", as CONNECT names its target. The port is required. */
export function parseAuthority(authority: string): { host: string; port: number } | null {
  const m = /^(\[[0-9a-fA-F:.%\w]+\]|[^\s:/?#[\]@]+):(\d{1,5})$/.exec(authority);
  if (!m) return null;
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return null;
  return { host: (m[1] as string).toLowerCase(), port };
}

function passOn(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const listed = String(headers.connection ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const out: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP.has(name) || listed.includes(name)) continue;
    out[name] = value;
  }
  return out;
}

function reply(res: ServerResponse, kind: Refusal): void {
  const status = STATUS[kind];
  res.writeHead(status, { 'x-egress-refused': kind, 'content-length': '0', connection: 'close' });
  res.end();
}

function endWith(client: Socket, kind: Refusal): void {
  const status = STATUS[kind];
  client.end(
    `HTTP/1.1 ${status} ${REASON[status] ?? 'Error'}\r\nX-Egress-Refused: ${kind}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
  );
}
