import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isId, newId } from './ids.ts';

test('ids are version 7 UUIDs that sort by creation time', () => {
  const a = newId(1_700_000_000_000);
  const b = newId(1_700_000_000_001);
  assert.ok(isId(a) && isId(b));
  assert.equal(a[14], '7');
  assert.ok('89ab'.includes(a[19] as string));
  assert.ok(a < b);
  assert.equal(Number.parseInt(a.replaceAll('-', '').slice(0, 12), 16), 1_700_000_000_000);
});

test('ids are random after the time', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(newId(0));
  assert.equal(seen.size, 1000);
});

test('isId accepts only lower-case UUIDs', () => {
  assert.ok(isId('0190a7c4-2b1e-7cde-8f00-123456789abc'));
  assert.ok(!isId('0190A7C4-2B1E-7CDE-8F00-123456789ABC'));
  assert.ok(!isId('not-an-id'));
  assert.ok(!isId('0190a7c4-2b1e-7cde-8f00-123456789abc '));
});
