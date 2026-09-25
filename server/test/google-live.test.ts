import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GOOGLE_KEYS_URL } from '../src/auth/google.ts';
import { importKeys } from '../src/auth/jwt.ts';

// Google's real, published signing keys: our reader takes every one, and they are what we expect
// (RSA, 2048 bits or more). Real sign-ins are checked on staging, with a real Google account.
test('Google’s published keys are read in full', async () => {
  const response = await fetch(GOOGLE_KEYS_URL, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /max-age=\d+/);
  const jwks = (await response.json()) as { keys: unknown[] };
  const keys = importKeys(jwks);
  assert.ok(keys.size >= 1);
  assert.equal(keys.size, jwks.keys.length);
  for (const key of keys.values()) {
    assert.equal(key.asymmetricKeyType, 'rsa');
    assert.ok((key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048);
  }
});
