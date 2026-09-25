import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';

/**
 * Test support: stands in for Google's side of sign-in, so the checks on our side can be exercised
 * with every kind of good and bad token. Keys are made here and published as a key set, the same
 * shape Google publishes at https://www.googleapis.com/oauth2/v3/certs. Never used by the server.
 */
export class TestIssuer {
  readonly keys = new Map<string, KeyObject>();
  readonly audience = 'agent-v-test.apps.googleusercontent.com';

  constructor(kids: string[] = ['key-1']) {
    for (const kid of kids) this.addKey(kid);
  }

  addKey(kid: string): void {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.keys.set(kid, privateKey);
  }

  /** The published key set. */
  jwks(): { keys: Record<string, unknown>[] } {
    return {
      keys: [...this.keys].map(([kid, key]) => ({
        ...key.export({ format: 'jwk' }),
        d: undefined,
        p: undefined,
        q: undefined,
        dp: undefined,
        dq: undefined,
        qi: undefined,
        kid,
        alg: 'RS256',
        use: 'sig',
      })),
    };
  }

  /** A token as Google would issue it, with any claim or header overridden. */
  token(
    overrides: Record<string, unknown> = {},
    options: { kid?: string; alg?: string; signWith?: KeyObject } = {},
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const kid = options.kid ?? [...this.keys.keys()][0] ?? 'key-1';
    const claims = {
      iss: 'https://accounts.google.com',
      aud: this.audience,
      azp: 'agent-v-android.apps.googleusercontent.com',
      sub: '110248495921238986420',
      email: 'maya@example.com',
      email_verified: true,
      name: 'Maya Rao',
      iat: now,
      exp: now + 3600,
      ...overrides,
    };
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const signed = `${enc({ alg: options.alg ?? 'RS256', kid, typ: 'JWT' })}.${enc(claims)}`;
    const key = options.signWith ?? this.keys.get(kid);
    if (!key) throw new Error(`no key ${kid}`);
    return `${signed}.${sign('RSA-SHA256', Buffer.from(signed), key).toString('base64url')}`;
  }

  /** A fetch that serves the key set, counting requests, with the cache lifetime Google gives. */
  fetcher(maxAge = 3600): { fetch: typeof fetch; calls: () => number } {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response(JSON.stringify(this.jwks()), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${maxAge}`,
        },
      });
    }) as typeof fetch;
    return { fetch: f, calls: () => calls };
  }
}
