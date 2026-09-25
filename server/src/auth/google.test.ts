import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { TestIssuer } from '../../test/google-tokens.ts';
import { createGoogleVerifier, KeysUnavailable } from './google.ts';
import { TokenError } from './jwt.ts';

const NONCE = 'q1w2e3r4t5y6u7i8o9p0';

function setup(maxAge = 3600) {
  const issuer = new TestIssuer();
  const served = issuer.fetcher(maxAge);
  let clock = Date.now();
  const verify = createGoogleVerifier({
    audience: issuer.audience,
    fetch: served.fetch,
    now: () => clock,
  });
  return { issuer, verify, calls: served.calls, tick: (ms: number) => (clock += ms) };
}

test('a good token gives the person: Google id, verified email, name', async () => {
  const { issuer, verify } = setup();
  const who = await verify(issuer.token({ nonce: NONCE }), NONCE);
  assert.deepEqual(who, {
    sub: '110248495921238986420',
    email: 'maya@example.com',
    name: 'Maya Rao',
  });
});

test('an unverified email is not taken', async () => {
  const { issuer, verify } = setup();
  const who = await verify(issuer.token({ nonce: NONCE, email_verified: false }), NONCE);
  assert.equal(who.email, null);
});

test('every kind of bad token is refused', async () => {
  const { issuer, verify } = setup();
  const now = Math.floor(Date.now() / 1000);
  const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const cases: [string, string, string?][] = [
    ['wrong nonce', issuer.token({ nonce: 'someone-elses' })],
    ['no nonce', issuer.token({})],
    ['another app', issuer.token({ nonce: NONCE, aud: 'other.apps.googleusercontent.com' })],
    ['another issuer', issuer.token({ nonce: NONCE, iss: 'https://evil.example' })],
    ['expired', issuer.token({ nonce: NONCE, exp: now - 120, iat: now - 3720 })],
    ['from the future', issuer.token({ nonce: NONCE, iat: now + 600, exp: now + 4200 })],
    ['not yet valid', issuer.token({ nonce: NONCE, nbf: now + 600 })],
    ['no subject', issuer.token({ nonce: NONCE, sub: '' })],
    ['signed by someone else', issuer.token({ nonce: NONCE }, { signWith: stranger })],
    ['unknown key', issuer.token({ nonce: NONCE }, { kid: 'nope', signWith: stranger })],
    ['alg none', issuer.token({ nonce: NONCE }, { alg: 'none' })],
    ['alg HS256', issuer.token({ nonce: NONCE }, { alg: 'HS256' })],
    ['malformed', 'not.a.jwt!'],
    ['two parts', 'abc.def'],
  ];
  for (const [what, token] of cases) {
    await assert.rejects(verify(token, NONCE), TokenError, what);
  }
  // A token whose claims were changed after signing.
  const good = issuer.token({ nonce: NONCE }).split('.');
  const forged = Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(good[1] as string, 'base64url').toString()),
      sub: '1',
    }),
  ).toString('base64url');
  await assert.rejects(
    verify(`${good[0]}.${forged}.${good[2]}`, NONCE),
    TokenError,
    'forged claims',
  );
});

test('keys are fetched once and kept as long as Google says', async () => {
  const { issuer, verify, calls, tick } = setup(600);
  await verify(issuer.token({ nonce: NONCE }), NONCE);
  await verify(issuer.token({ nonce: NONCE }), NONCE);
  assert.equal(calls(), 1);
  tick(601_000);
  await verify(issuer.token({ nonce: NONCE }), NONCE);
  assert.equal(calls(), 2);
});

test('a new key from Google is picked up when a token uses it, at most once a minute', async () => {
  const { issuer, verify, calls, tick } = setup();
  await verify(issuer.token({ nonce: NONCE }), NONCE);
  issuer.addKey('key-2');
  tick(61_000);
  await verify(issuer.token({ nonce: NONCE }, { kid: 'key-2' }), NONCE);
  assert.equal(calls(), 2);
  // An unknown key right after a fetch doesn't make us fetch again.
  await assert.rejects(
    verify(
      issuer.token({ nonce: NONCE }, { kid: 'key-3', signWith: issuer.keys.get('key-1') }),
      NONCE,
    ),
    TokenError,
  );
  assert.equal(calls(), 2);
});

test('when Google cannot be reached, known keys keep working and none means unavailable', async () => {
  const issuer = new TestIssuer();
  let up = true;
  let clock = Date.now();
  const verify = createGoogleVerifier({
    audience: issuer.audience,
    now: () => clock,
    fetch: (async () => {
      if (!up) throw new Error('offline');
      return new Response(JSON.stringify(issuer.jwks()), {
        headers: { 'cache-control': 'max-age=60' },
      });
    }) as typeof fetch,
  });
  await verify(issuer.token({ nonce: NONCE }), NONCE);
  up = false;
  clock += 120_000;
  await verify(issuer.token({ nonce: NONCE }), NONCE);

  const cold = createGoogleVerifier({
    audience: issuer.audience,
    fetch: (async () => {
      throw new Error('offline');
    }) as typeof fetch,
  });
  await assert.rejects(cold(issuer.token({ nonce: NONCE }), NONCE), KeysUnavailable);
});
