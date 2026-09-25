import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, day } from './format.ts';

const now = new Date('2026-09-25T12:00:00Z');
const before = (ms: number) => new Date(now.getTime() - ms).toISOString();

test('a day reads "25 September", with the year only when it differs', () => {
  assert.equal(day('2026-09-25T09:00:00Z', now), '25 September');
  assert.equal(day('2025-12-31T09:00:00Z', now), '31 December 2025');
});

test('how long ago reads naturally', () => {
  assert.equal(ago(before(20_000), now), 'just now');
  assert.equal(ago(before(60_000), now), '1 minute ago');
  assert.equal(ago(before(5 * 60_000), now), '5 minutes ago');
  assert.equal(ago(before(60 * 60_000), now), '1 hour ago');
  assert.equal(ago(before(3 * 60 * 60_000), now), '3 hours ago');
  assert.equal(ago(before(26 * 60 * 60_000), now), 'yesterday');
  assert.equal(ago(before(3 * 24 * 60 * 60_000), now), '3 days ago');
  assert.equal(ago(before(20 * 24 * 60 * 60_000), now), 'on 5 September');
});
