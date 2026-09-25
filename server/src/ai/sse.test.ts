import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readEvents, type ServerEvent, StreamTooLarge } from './sse.ts';

async function* chunks(...parts: (string | Uint8Array)[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield typeof p === 'string' ? new TextEncoder().encode(p) : p;
}

async function all(body: AsyncIterable<Uint8Array>): Promise<ServerEvent[]> {
  const out: ServerEvent[] = [];
  for await (const e of readEvents(body)) out.push(e);
  return out;
}

test('events, with and without a name, multi-line data, comments and the three line endings', async () => {
  const stream =
    '﻿: a comment, and a BOM before it\n' +
    'event: message_start\n' +
    'data: {"a":1}\n\n' +
    'data: line one\r\ndata: line two\r\n\r\n' +
    'event: ping\rdata:no space\r\r' +
    'data\n\n' + // a field with no colon: empty data, still an event
    'id: 7\nretry: 10\nevent: x\n\n' + // no data: nothing is sent
    'data:  two spaces keep one\n\n';
  assert.deepEqual(await all(chunks(stream)), [
    { event: 'message_start', data: '{"a":1}' },
    { event: 'message', data: 'line one\nline two' },
    { event: 'ping', data: 'no space' },
    { event: 'message', data: '' },
    { event: 'message', data: ' two spaces keep one' },
  ]);
});

test('the same stream split at every byte reads the same', async () => {
  const bytes = new TextEncoder().encode(
    'event: delta\r\ndata: {"text":"héllo — 世界 🙂"}\r\n\r\ndata: [DONE]\r\n\r\n',
  );
  const whole = await all(chunks(bytes));
  assert.equal(whole.length, 2);
  assert.equal(JSON.parse(whole[0]?.data ?? '').text, 'héllo — 世界 🙂');
  for (let i = 1; i < bytes.length; i++) {
    assert.deepEqual(await all(chunks(bytes.slice(0, i), bytes.slice(i))), whole, `split at ${i}`);
  }
  // And one byte at a time.
  assert.deepEqual(await all(chunks(...Array.from(bytes, (b) => Uint8Array.of(b)))), whole);
});

test('an event the stream ends in the middle of is dropped', async () => {
  assert.deepEqual(await all(chunks('data: done\n\ndata: cut off')), [
    { event: 'message', data: 'done' },
  ]);
});

test('an endless line or event ends the stream as broken', async () => {
  const big = 'x'.repeat(1024 * 1024);
  async function* endlessLine() {
    yield new TextEncoder().encode('data: ');
    for (let i = 0; i < 17; i++) yield new TextEncoder().encode(big);
  }
  await assert.rejects(all(endlessLine()), StreamTooLarge);
  async function* endlessEvent() {
    for (let i = 0; i < 17; i++) yield new TextEncoder().encode(`data: ${big}\n`);
  }
  await assert.rejects(all(endlessEvent()), StreamTooLarge);
});
