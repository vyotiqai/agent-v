import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGoogleSignIn, parsePhoneInfo, parseRefresh } from './accounts.ts';

const phone = {
  platform: 'android',
  model: 'Pixel 8',
  signingKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE',
};

test('a phone is accepted with a platform, a one-line model and a base64 key', () => {
  assert.deepEqual(parsePhoneInfo(phone), phone);
  assert.deepEqual(
    parsePhoneInfo({ ...phone, model: '  Galaxy S24+ (5G)  ' })?.model,
    'Galaxy S24+ (5G)',
  );
  for (const bad of [
    null,
    [],
    { ...phone, platform: 'windows' },
    { ...phone, model: '' },
    { ...phone, model: 'x'.repeat(61) },
    { ...phone, model: 'Pixel\n8' },
    { ...phone, model: '<script>' },
    { ...phone, signingKey: 'not base64!' },
    { ...phone, signingKey: 7 },
  ]) {
    assert.equal(parsePhoneInfo(bad), null, JSON.stringify(bad));
  }
});

test('a Google sign-in needs a token, a nonce and a phone', () => {
  const ok = { idToken: 'a.b.c', nonce: 'n0nce_-', phone };
  assert.deepEqual(parseGoogleSignIn(ok), ok);
  assert.equal(parseGoogleSignIn({ ...ok, idToken: '' }), null);
  assert.equal(parseGoogleSignIn({ ...ok, idToken: 'x'.repeat(4097) }), null);
  assert.equal(parseGoogleSignIn({ ...ok, nonce: 'has space' }), null);
  assert.equal(parseGoogleSignIn({ ...ok, phone: { ...phone, platform: 'x' } }), null);
  assert.equal(parseGoogleSignIn('a.b.c'), null);
});

test('a refresh needs a base64url token of sensible length', () => {
  assert.deepEqual(parseRefresh({ refreshToken: 'abc_DEF-123' }), { refreshToken: 'abc_DEF-123' });
  assert.equal(parseRefresh({ refreshToken: 'a+b' }), null);
  assert.equal(parseRefresh({ refreshToken: 'x'.repeat(101) }), null);
  assert.equal(parseRefresh({}), null);
});
