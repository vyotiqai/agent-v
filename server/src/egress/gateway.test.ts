import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer as createHttpServer, request, type Server } from 'node:http';
import { type AddressInfo, connect, createServer as createTcpServer } from 'node:net';
import { after, before, test } from 'node:test';
import { createLogger } from '../log.ts';
import type { Resolved } from './address.ts';
import { createGateway, parseAuthority } from './gateway.ts';

const logLines: string[] = [];
const logger = createLogger({ write: (l) => logLines.push(l) });

// A gateway with the real public-address rule, and one whose rule lets `target.test` through to
// this machine, so the paths that do connect can be tested without reaching the internet.
let real: Server;
let open: Server;
let echo: ReturnType<typeof createTcpServer>;
let web: Server;
let echoConnections = 0;
const webSeen: { host: string | undefined; auth: string | undefined; path: string | undefined }[] =
  [];

const allowTargetTest = async (host: string): Promise<Resolved> =>
  host === 'target.test' ? { ok: true, address: '127.0.0.1' } : { ok: false, kind: 'dns' };

async function listen(server: Server | ReturnType<typeof createTcpServer>): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return (server.address() as AddressInfo).port;
}

let realPort = 0;
let openPort = 0;
let echoPort = 0;
let webPort = 0;

before(async () => {
  echo = createTcpServer((s) => {
    echoConnections++;
    s.pipe(s);
  });
  web = createHttpServer((req, res) => {
    webSeen.push({
      host: req.headers.host,
      auth: req.headers['proxy-authorization'],
      path: req.url,
    });
    if (req.url === '/moved') res.writeHead(302, { location: 'http://169.254.169.254/' }).end();
    else res.writeHead(200, { 'content-type': 'text/plain' }).end(`hello ${req.url}`);
  });
  real = createGateway({ logger });
  open = createGateway({ logger, resolve: allowTargetTest });
  [echoPort, webPort, realPort, openPort] = await Promise.all([
    listen(echo),
    listen(web),
    listen(real),
    listen(open),
  ]);
});

after(() => {
  for (const s of [echo, web, real, open]) s.close();
});

/** Sends CONNECT and returns the status line and headers, and the socket for the tunnel. */
async function connectVia(port: number, authority: string) {
  const socket = connect(port, '127.0.0.1');
  await once(socket, 'connect');
  socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
  let buffer = '';
  while (!buffer.includes('\r\n\r\n')) {
    const [chunk] = (await once(socket, 'data')) as [Buffer];
    buffer += chunk.toString('latin1');
  }
  const head = buffer.slice(0, buffer.indexOf('\r\n\r\n'));
  const [statusLine, ...headerLines] = head.split('\r\n');
  const headers = Object.fromEntries(
    headerLines.map((l) => [
      l.slice(0, l.indexOf(':')).toLowerCase(),
      l.slice(l.indexOf(':') + 1).trim(),
    ]),
  );
  return { status: Number((statusLine ?? '').split(' ')[1]), headers, socket };
}

function get(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>(
    (resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      });
      req.on('error', reject);
      req.end();
    },
  );
}

test('CONNECT to a private or local address is refused, and nothing is connected', async () => {
  const before = echoConnections;
  for (const target of [
    `127.0.0.1:${echoPort}`,
    `localhost:${echoPort}`,
    `[::1]:${echoPort}`,
    '169.254.169.254:80',
    '10.0.0.1:443',
    '192.168.1.1:443',
    '[fd00::1]:443',
    `[::ffff:127.0.0.1]:${echoPort}`,
  ]) {
    const r = await connectVia(realPort, target);
    assert.equal(r.status, 403, target);
    assert.equal(r.headers['x-egress-refused'], 'private-address', target);
    r.socket.destroy();
  }
  assert.equal(echoConnections, before);
});

test('an allowed CONNECT tunnels bytes both ways, to the address that was checked', async () => {
  const r = await connectVia(openPort, `target.test:${echoPort}`);
  assert.equal(r.status, 200);
  r.socket.write('ping through the tunnel');
  const [reply] = (await once(r.socket, 'data')) as [Buffer];
  assert.equal(reply.toString(), 'ping through the tunnel');
  r.socket.destroy();
});

test('CONNECT to a port nobody listens on is a connection failure', async () => {
  const closed = createTcpServer();
  const port = await listen(closed);
  closed.close();
  await once(closed, 'close');
  const r = await connectVia(openPort, `target.test:${port}`);
  assert.equal(r.status, 502);
  assert.equal(r.headers['x-egress-refused'], 'connect-failed');
  r.socket.destroy();
});

test('a name that does not resolve is refused as a DNS failure', async () => {
  const r = await connectVia(openPort, 'nowhere.test:443');
  assert.equal(r.status, 502);
  assert.equal(r.headers['x-egress-refused'], 'dns');
  r.socket.destroy();
});

test('a malformed CONNECT target is a bad request', async () => {
  for (const target of [
    'target.test',
    'target.test:0',
    'target.test:99999',
    'user@target.test:443',
  ]) {
    const r = await connectVia(openPort, target);
    assert.equal(r.status, 400, target);
    r.socket.destroy();
  }
});

test('plain HTTP is forwarded with the Host kept and proxy credentials removed', async () => {
  const r = await get(openPort, `http://target.test:${webPort}/page?q=1`, {
    'proxy-authorization': 'Basic c2VjcmV0',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body, 'hello /page?q=1');
  const seen = webSeen.at(-1);
  assert.equal(seen?.host, `target.test:${webPort}`);
  assert.equal(seen?.auth, undefined);
  assert.equal(seen?.path, '/page?q=1');
});

test('a redirect is passed back, never followed by the gateway', async () => {
  const count = webSeen.length;
  const r = await get(openPort, `http://target.test:${webPort}/moved`);
  assert.equal(r.status, 302);
  assert.equal(r.headers['location'], 'http://169.254.169.254/');
  assert.equal(webSeen.length, count + 1);
});

test('plain HTTP to a private address is refused', async () => {
  const r = await get(realPort, `http://127.0.0.1:${webPort}/`);
  assert.equal(r.status, 403);
  assert.equal(r.headers['x-egress-refused'], 'private-address');
});

test('only absolute http URLs are forwarded; /healthz answers for probes', async () => {
  assert.equal((await get(openPort, '/healthz')).status, 200);
  assert.equal((await get(openPort, '/other')).status, 400);
  assert.equal((await get(openPort, 'https://target.test/')).status, 400);
  assert.equal((await get(openPort, 'http://user:pass@target.test/')).status, 400);
});

test('the gateway logs kinds and sizes, never where anyone went', () => {
  const all = logLines.join('');
  assert.ok(logLines.length > 0);
  for (const secret of ['target.test', '169.254', 'page?q', '127.0.0.1', 'localhost', 'c2VjcmV0']) {
    assert.ok(!all.includes(secret), secret);
  }
  assert.ok(all.includes('"errorKind":"private-address"'));
});

test('parseAuthority reads host:port and [v6]:port', () => {
  assert.deepEqual(parseAuthority('Example.com:443'), { host: 'example.com', port: 443 });
  assert.deepEqual(parseAuthority('[2606:4700::1111]:8443'), {
    host: '[2606:4700::1111]',
    port: 8443,
  });
  assert.equal(parseAuthority('example.com'), null);
  assert.equal(parseAuthority('example.com:65536'), null);
  assert.equal(parseAuthority('a b:80'), null);
});
