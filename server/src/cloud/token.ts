/**
 * Access tokens for our own calls to Google Cloud (Cloud KMS, Cloud Storage), from the metadata
 * server that Cloud Run gives every service: the service's own identity, with no key file to
 * keep (stage 6, section 17). These calls are ours, not made on anyone's behalf, so they don't go
 * through the egress gateway, which refuses the metadata server's address by design.
 */

const METADATA_TOKEN =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** A token is renewed this long before it expires. */
const EARLY_MS = 5 * 60_000;

export type AccessToken = () => Promise<string>;

export function metadataToken(
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): AccessToken {
  let cached: { token: string; until: number } | null = null;
  let pending: Promise<string> | null = null;

  const renew = async (): Promise<string> => {
    const res = await fetchFn(METADATA_TOKEN, {
      headers: { 'metadata-flavor': 'Google' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`The metadata server answered ${res.status}.`);
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
      throw new Error("The metadata server's token isn't in the expected shape.");
    }
    cached = { token: body.access_token, until: now() + body.expires_in * 1000 - EARLY_MS };
    return body.access_token;
  };

  return async () => {
    if (cached && now() < cached.until) return cached.token;
    // One renewal at a time, however many calls need it.
    pending ??= renew().finally(() => {
      pending = null;
    });
    return pending;
  };
}
