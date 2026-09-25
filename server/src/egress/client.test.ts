import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer, type Server as HttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createLogger } from '../log.ts';
import type { Resolved } from './address.ts';
import { createEgress, type Egress, EgressError } from './client.ts';
import { createGateway } from './gateway.ts';

// A real gateway whose address rule sends `target.test` to this machine and treats
// `inside.test` as our own network; a real HTTPS server with a certificate made for the test.
let gateway: Server;
let site: HttpsServer;
let sitePort = 0;
let egress: Egress;
let ca = '';
const seen: { method?: string; host?: string; body: string }[] = [];

const rule = async (host: string): Promise<Resolved> => {
  if (host === 'target.test') return { ok: true, address: '127.0.0.1' };
  if (host === 'inside.test') return { ok: false, kind: 'private-address' };
  return { ok: false, kind: 'dns' };
};

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'egress-'));
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:P-256',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=target.test',
        '-addext',
        'subjectAltName=DNS:target.test',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    ca = readFileSync(join(dir, 'cert.pem'), 'utf8');
    site = createServer({ key: readFileSync(join(dir, 'key.pem')), cert: ca }, (req, res) => {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        seen.push({ method: req.method, host: req.headers.host, body });
        if (req.url === '/silent') return; // never answers
        if (req.url === '/stall') {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write('data: first\n\n'); // then nothing more
          return;
        }
        res.writeHead(201, { 'content-type': 'text/plain', 'x-seen': 'yes' });
        res.end(`${req.method} ${req.url} ${body}`);
      });
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  site.listen(0, '127.0.0.1');
  await once(site, 'listening');
  sitePort = (site.address() as AddressInfo).port;

  gateway = createGateway({ logger: createLogger({ write: () => {} }), resolve: rule });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  egress = createEgress({
    gateway: { host: '127.0.0.1', port: (gateway.address() as AddressInfo).port },
    ca,
    connectTimeoutMs: 2000,
    idleTimeoutMs: 300,
  });
});

after(() => {
  site.closeAllConnections();
  site.close();
  gateway.closeAllConnections();
  gateway.close();
});

async function text(body: AsyncIterable<Uint8Array>): Promise<string> {
  let out = '';
  for await (const chunk of body) out += Buffer.from(chunk).toString();
  return out;
}

const refusal = (kind: string) => (err: unknown) => err instanceof EgressError && err.kind === kind;

test('a call goes through the gateway, with TLS end to end, and comes back whole', async () => {
  const res = await egress(`https://target.test:${sitePort}/v1/models?limit=2`, {
    headers: { authorization: 'Bearer k' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.headers['x-seen'], 'yes');
  assert.equal(await text(res.body), 'GET /v1/models?limit=2 ');
  assert.equal(seen.at(-1)?.host, `target.test:${sitePort}`);
});

test('a POST carries its body', async () => {
  const res = await egress(`https://target.test:${sitePort}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"ask":"é"}',
  });
  assert.equal(await text(res.body), 'POST /v1/messages {"ask":"é"}');
});

test('an address inside our own network is refused by the gateway, and says so', async () => {
  await assert.rejects(egress('https://inside.test/v1/models'), refusal('private-address'));
  await assert.rejects(egress('https://nowhere.test/v1/models'), refusal('dns'));
});

test('only https addresses without a user name or password are called', async () => {
  for (const bad of [
    'http://target.test/v1/models',
    'https://me:secret@target.test/v1/models',
    'ftp://target.test/',
    'not a url',
  ]) {
    await assert.rejects(egress(bad), refusal('bad-address'), bad);
  }
});

test("a certificate that isn't trusted fails the call", async () => {
  const strict = createEgress({
    gateway: { host: '127.0.0.1', port: (gateway.address() as AddressInfo).port },
  });
  await assert.rejects(strict(`https://target.test:${sitePort}/`), refusal('connect-failed'));
});

test("an answer that doesn't start in time is a timeout", async () => {
  const quick = createEgress({
    gateway: { host: '127.0.0.1', port: (gateway.address() as AddressInfo).port },
    ca,
    connectTimeoutMs: 300,
  });
  await assert.rejects(quick(`https://target.test:${sitePort}/silent`), refusal('timeout'));
});

test('silence in the middle of an answer ends it as a timeout', async () => {
  const res = await egress(`https://target.test:${sitePort}/stall`);
  await assert.rejects(text(res.body), refusal('timeout'));
});

test("the caller's signal stops a call, before or during the answer", async () => {
  const before = new AbortController();
  before.abort(new Error('stopped'));
  await assert.rejects(egress(`https://target.test:${sitePort}/`, { signal: before.signal }), {
    message: 'stopped',
  });

  const during = new AbortController();
  const res = await egress(`https://target.test:${sitePort}/stall`, { signal: during.signal });
  setTimeout(() => during.abort(new Error('stopped')), 50);
  await assert.rejects(text(res.body), { message: 'stopped' });
});
