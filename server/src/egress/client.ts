import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { isIP, connect as netConnect, type Socket } from 'node:net';
import { type TLSSocket, connect as tlsConnect } from 'node:tls';

/**
 * Calls to the internet made on someone's behalf (stage 6, section 5): their AI provider, their
 * custom endpoint, their search key. Every one goes through the egress gateway, which checks the
 * address; there is no way to call out directly from here, so a custom endpoint can never reach
 * our own network, whatever name it is given.
 *
 * The call is tunnelled (CONNECT) to the gateway, and TLS runs end to end with the provider, so
 * the gateway never sees the key or the conversation. Only `https:` addresses are called: a key
 * never crosses the internet in the clear. Redirects are not followed.
 */

export type EgressErrorKind =
  /** The gateway refused: the name leads to an address that isn't the public internet. */
  | 'private-address'
  /** The name doesn't resolve. */
  | 'dns'
  /** Nothing answered at the address, the connection broke, or TLS failed. */
  | 'connect-failed'
  | 'timeout'
  /** Not a callable address: not https, or has a user name or password in it. */
  | 'bad-address';

export class EgressError extends Error {
  readonly kind: EgressErrorKind;
  constructor(kind: EgressErrorKind, options?: { cause?: unknown }) {
    super(`The call couldn't be made: ${kind}.`, options);
    this.name = 'EgressError';
    this.kind = kind;
  }
}

export interface EgressResponse {
  status: number;
  headers: IncomingHttpHeaders;
  /** The body as it arrives; read it to the end, or `cancel()` it. */
  body: AsyncIterable<Uint8Array>;
  cancel(): void;
}

export interface EgressRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type Egress = (url: string, init?: EgressRequest) => Promise<EgressResponse>;

export interface EgressOptions {
  /** Where the egress gateway listens. */
  gateway: { host: string; port: number };
  /** For connecting and for the answer to start. */
  connectTimeoutMs?: number;
  /** For silence in the middle of an answer; a model may think for a while between words. */
  idleTimeoutMs?: number;
  /** Tests trust their own certificate authority; everything else uses the system's. */
  ca?: string;
}

const REFUSALS = new Set<string>(['private-address', 'dns', 'connect-failed', 'timeout']);

export function createEgress(options: EgressOptions): Egress {
  const connectTimeoutMs = options.connectTimeoutMs ?? 15_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 120_000;

  return async (address, init = {}) => {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      throw new EgressError('bad-address');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new EgressError('bad-address');
    }
    const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
    const port = url.port === '' ? 443 : Number(url.port);
    const { signal } = init;
    signal?.throwIfAborted();

    // Everything below shares one deadline until the answer starts.
    const deadline = AbortSignal.timeout(connectTimeoutMs);
    const stop = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const failure = (err: unknown): unknown => {
      if (signal?.aborted) return signal.reason;
      if (deadline.aborted) return new EgressError('timeout', { cause: err });
      return err instanceof EgressError ? err : new EgressError('connect-failed', { cause: err });
    };

    let tunnel: Socket | undefined;
    let tls: TLSSocket | undefined;
    const destroy = () => {
      tls?.destroy();
      tunnel?.destroy();
    };
    stop.addEventListener('abort', destroy, { once: true });
    try {
      tunnel = await openTunnel(options.gateway, host, port);
      tls = await startTls(tunnel, host, options.ca);
      const res = await send(tls, url, init);
      stop.removeEventListener('abort', destroy);
      // From here the caller's own signal still ends the call; the deadline no longer applies.
      const onAbort = () => res.destroy(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      res.on('close', () => signal?.removeEventListener('abort', onAbort));
      res.socket.setTimeout(idleTimeoutMs, () => res.destroy(new EgressError('timeout')));
      return {
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: res,
        cancel: () => res.destroy(),
      };
    } catch (err) {
      stop.removeEventListener('abort', destroy);
      destroy();
      throw failure(err);
    }
  };
}

/** Asks the gateway for a tunnel to host:port; a refusal names its kind in X-Egress-Refused. */
function openTunnel(
  gateway: { host: string; port: number },
  host: string,
  port: number,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(gateway);
    const authority = isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
    let head = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end === -1) {
        if (head.length > 8192) fail(new EgressError('connect-failed'));
        return;
      }
      socket.off('data', onData);
      const lines = head.subarray(0, end).toString('latin1').split('\r\n');
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(lines[0] ?? '')?.[1]);
      if (status === 200 && head.length === end + 4) {
        socket.off('error', fail);
        socket.off('close', closed);
        resolve(socket);
        return;
      }
      const refused = lines
        .find((l) => l.toLowerCase().startsWith('x-egress-refused:'))
        ?.slice('x-egress-refused:'.length)
        .trim();
      fail(
        new EgressError(
          refused && REFUSALS.has(refused) ? (refused as EgressErrorKind) : 'connect-failed',
        ),
      );
    };
    const fail = (err: unknown) => {
      socket.destroy();
      reject(err);
    };
    const closed = () => fail(new EgressError('connect-failed'));
    socket.on('data', onData);
    socket.on('error', fail);
    socket.on('close', closed);
    socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
  });
}

function startTls(socket: Socket, host: string, ca: string | undefined): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const tls = tlsConnect({
      socket,
      servername: isIP(host) ? undefined : host,
      ALPNProtocols: ['http/1.1'],
      ...(ca ? { ca } : {}),
    });
    tls.once('secureConnect', () => {
      tls.off('error', reject);
      resolve(tls);
    });
    tls.once('error', reject);
  });
}

function send(tls: TLSSocket, url: URL, init: EgressRequest): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      method: init.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      headers: {
        host: url.host,
        ...(init.body === undefined ? {} : { 'content-length': Buffer.byteLength(init.body) }),
        ...init.headers,
      },
      createConnection: () => tls,
    });
    let response: IncomingMessage | undefined;
    req.once('response', (res) => {
      response = res;
      // Whoever reads the body meets its errors there; an unread body's errors end it quietly.
      res.on('error', () => {});
      resolve(res);
    });
    req.on('error', (err) => {
      if (response) response.destroy(err);
      else reject(err);
    });
    req.end(init.body);
  });
}
