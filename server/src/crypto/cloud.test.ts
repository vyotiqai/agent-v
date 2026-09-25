import assert from 'node:assert/strict';
import { test } from 'node:test';
import { metadataToken } from '../cloud/token.ts';
import { bucketKeyStore, CloudError, kmsWrapper } from './cloud.ts';

// These check what our clients send and how they read Google's answers. That they work with
// Google Cloud itself is checked on staging (slice 0's cloud part).

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | Uint8Array | undefined;
}

function recorder(answer: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: init.body as string | Uint8Array | undefined,
    };
    calls.push(call);
    return answer(call);
  }) as typeof fetch;
  return { calls, fetchFn };
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test('a metadata token is fetched once, shared, and renewed before it expires', async () => {
  let t = 0;
  let n = 0;
  const { calls, fetchFn } = recorder(() => json({ access_token: `tok-${++n}`, expires_in: 3600 }));
  const token = metadataToken(fetchFn, () => t);
  assert.deepEqual(await Promise.all([token(), token(), token()]), ['tok-1', 'tok-1', 'tok-1']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.headers['metadata-flavor'], 'Google');
  t = 3600_000 - 5 * 60_000 - 1;
  assert.equal(await token(), 'tok-1');
  t += 1;
  assert.equal(await token(), 'tok-2');
});

test('Cloud KMS wraps and unwraps with the context as authenticated data', async () => {
  const key = 'projects/p/locations/europe-west1/keyRings/r/cryptoKeys/data-keys';
  const { calls, fetchFn } = recorder((call) => {
    const body = JSON.parse(String(call.body));
    return call.url.endsWith(':encrypt')
      ? json({ name: key, ciphertext: Buffer.from(`W(${body.plaintext})`).toString('base64') })
      : json({ plaintext: Buffer.from('dk').toString('base64') });
  });
  const kms = kmsWrapper(key, async () => 'tok', fetchFn);
  const wrapped = await kms.wrap(Buffer.from('dk'), 'agent-v/data-key/p1');
  assert.equal(wrapped.toString(), `W(${Buffer.from('dk').toString('base64')})`);
  assert.deepEqual(await kms.unwrap(wrapped, 'agent-v/data-key/p1'), Buffer.from('dk'));

  assert.equal(calls[0]?.url, `https://cloudkms.googleapis.com/v1/${key}:encrypt`);
  assert.equal(calls[1]?.url, `https://cloudkms.googleapis.com/v1/${key}:decrypt`);
  for (const c of calls) {
    assert.equal(c.method, 'POST');
    assert.equal(c.headers['authorization'], 'Bearer tok');
    assert.equal(
      JSON.parse(String(c.body)).additionalAuthenticatedData,
      Buffer.from('agent-v/data-key/p1').toString('base64'),
    );
  }
  assert.equal(JSON.parse(String(calls[1]?.body)).ciphertext, wrapped.toString('base64'));
});

test('a refusal from Cloud KMS is an error, never a key', async () => {
  const { fetchFn } = recorder(() => json({ error: { code: 403 } }, 403));
  const kms = kmsWrapper('projects/p/x', async () => 'tok', fetchFn);
  await assert.rejects(kms.unwrap(Buffer.from('x'), 'c'), (e) => e instanceof CloudError);
});

test('the key bucket creates only when absent, reads, and destroys', async () => {
  const objects = new Map<string, Uint8Array>();
  const { calls, fetchFn } = recorder((call) => {
    const url = new URL(call.url);
    if (call.method === 'POST') {
      const name = url.searchParams.get('name') ?? '';
      if (url.searchParams.get('ifGenerationMatch') === '0' && objects.has(name)) {
        return new Response(null, { status: 412 });
      }
      objects.set(name, call.body as Uint8Array);
      return json({ name });
    }
    const name = decodeURIComponent(url.pathname.split('/o/')[1] ?? '');
    if (call.method === 'DELETE') {
      return new Response(null, { status: objects.delete(name) ? 204 : 404 });
    }
    const found = objects.get(name);
    return found ? new Response(found) : new Response(null, { status: 404 });
  });
  const store = bucketKeyStore('agent-v-keys', async () => 'tok', fetchFn);

  assert.equal(await store.create('p1', Buffer.from('wrapped')), true);
  assert.equal(await store.create('p1', Buffer.from('other')), false);
  assert.deepEqual(await store.read('p1'), Buffer.from('wrapped'));
  await store.destroy('p1');
  await store.destroy('p1');
  assert.equal(await store.read('p1'), null);

  const upload = new URL(calls[0]?.url ?? '');
  assert.equal(
    upload.origin + upload.pathname,
    'https://storage.googleapis.com/upload/storage/v1/b/agent-v-keys/o',
  );
  assert.equal(upload.searchParams.get('name'), 'data-keys/p1');
  assert.equal(
    calls[2]?.url,
    'https://storage.googleapis.com/storage/v1/b/agent-v-keys/o/data-keys%2Fp1?alt=media',
  );
  assert.ok(calls.every((c) => c.headers['authorization'] === 'Bearer tok'));
});
