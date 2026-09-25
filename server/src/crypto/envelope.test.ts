import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { LocalWrapper, MemoryStore } from '../../test/stand-ins.ts';
import { newId } from '../ids.ts';
import { createLogger } from '../log.ts';
import { DataKeys, open, seal } from './envelope.ts';

const quiet = createLogger({ write: () => {} });

test('sealed values open with the same key and context, and only then', () => {
  const key = randomBytes(32);
  const secret = Buffer.from('sk-ant-api03-example-key');
  const sealed = seal(key, secret, 'ai_keys/row-1');
  assert.deepEqual(open(key, sealed, 'ai_keys/row-1'), secret);
  assert.ok(!sealed.includes(secret));
  assert.throws(() => open(key, sealed, 'ai_keys/row-2'));
  assert.throws(() => open(randomBytes(32), sealed, 'ai_keys/row-1'));
  for (const i of [0, 1, 13, sealed.length - 1]) {
    const tampered = Buffer.from(sealed);
    tampered[i] = (tampered[i] as number) ^ 1;
    assert.throws(() => open(key, tampered, 'ai_keys/row-1'), `byte ${i}`);
  }
  assert.throws(() => open(key, sealed.subarray(0, 20), 'ai_keys/row-1'));
});

test('sealing the same value twice gives different bytes', () => {
  const key = randomBytes(32);
  const a = seal(key, Buffer.from('same'), 'c');
  const b = seal(key, Buffer.from('same'), 'c');
  assert.notDeepEqual(a, b);
});

test('a person gets one data key, made on first need and kept only wrapped', async () => {
  const store = new MemoryStore();
  const lines: string[] = [];
  const keys = new DataKeys(
    new LocalWrapper(),
    store,
    createLogger({ write: (l) => lines.push(l) }),
  );
  const person = newId();
  assert.equal(await keys.existing(person), null);
  const first = await keys.forPerson(person);
  assert.equal(first.length, 32);
  assert.deepEqual(await keys.forPerson(person), first);
  assert.deepEqual(await keys.existing(person), first);
  assert.ok(
    !(store.keys.get(person) as Buffer).includes(first),
    'the store holds the key only wrapped',
  );
  assert.equal(lines.filter((l) => l.includes('datakey.created')).length, 1);
});

test('two processes making the same person’s key at once end up with the same key', async () => {
  const keys = new DataKeys(new LocalWrapper(), new MemoryStore(), quiet);
  const person = newId();
  const [a, b, c] = await Promise.all([
    keys.forPerson(person),
    keys.forPerson(person),
    keys.forPerson(person),
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test('destroying a person’s data key makes their secrets unreadable, for good', async () => {
  const keys = new DataKeys(new LocalWrapper(), new MemoryStore(), quiet);
  const person = newId();
  const sealed = seal(await keys.forPerson(person), Buffer.from('refresh-token'), 'accounts/1');
  await keys.destroy(person);
  assert.equal(await keys.existing(person), null);
  // A new key can be made later, but it opens nothing sealed before.
  const fresh = await keys.forPerson(person);
  assert.throws(() => open(fresh, sealed, 'accounts/1'));
});

test('one person’s wrapped key cannot be passed off as another’s', async () => {
  const store = new MemoryStore();
  const keys = new DataKeys(new LocalWrapper(), store, quiet);
  const maya = newId();
  const sam = newId();
  await keys.forPerson(maya);
  store.keys.set(sam, store.keys.get(maya) as Buffer);
  await assert.rejects(keys.existing(sam));
});
