import type { AccessToken } from '../cloud/token.ts';
import type { KeyWrapper, WrappedKeyStore } from './envelope.ts';

/**
 * The production halves of envelope encryption (D107, D126): Cloud KMS wraps each person's data
 * key, and a Cloud Storage bucket with no soft delete and no versions keeps the wrapped keys.
 * Both are our own small clients of Google's REST APIs (rule 6).
 */

const TIMEOUT_MS = 10_000;

export class CloudError extends Error {
  readonly status: number;
  constructor(what: string, status: number) {
    super(`${what} answered ${status}.`);
    this.name = 'CloudError';
    this.status = status;
  }
}

/**
 * Cloud KMS: `keyName` is the full name of a symmetric key, projects/…/cryptoKeys/…. The context
 * goes in as additional authenticated data, so a wrapped key opens only for the person it was
 * made for.
 */
export function kmsWrapper(
  keyName: string,
  token: AccessToken,
  fetchFn: typeof fetch = fetch,
): KeyWrapper {
  const call = async (verb: 'encrypt' | 'decrypt', body: object): Promise<unknown> => {
    const res = await fetchFn(`https://cloudkms.googleapis.com/v1/${keyName}:${verb}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await token()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new CloudError(`Cloud KMS ${verb}`, res.status);
    return res.json();
  };
  const aad = (context: string) => Buffer.from(context, 'utf8').toString('base64');
  return {
    async wrap(dataKey, context) {
      const out = (await call('encrypt', {
        plaintext: dataKey.toString('base64'),
        additionalAuthenticatedData: aad(context),
      })) as { ciphertext?: unknown };
      if (typeof out.ciphertext !== 'string') throw new Error('Cloud KMS returned no ciphertext.');
      return Buffer.from(out.ciphertext, 'base64');
    },
    async unwrap(wrapped, context) {
      const out = (await call('decrypt', {
        ciphertext: wrapped.toString('base64'),
        additionalAuthenticatedData: aad(context),
      })) as { plaintext?: unknown };
      if (typeof out.plaintext !== 'string') throw new Error('Cloud KMS returned no plaintext.');
      return Buffer.from(out.plaintext, 'base64');
    },
  };
}

/** The bucket of wrapped data keys: one object per person, named by their id. */
export function bucketKeyStore(
  bucket: string,
  token: AccessToken,
  fetchFn: typeof fetch = fetch,
): WrappedKeyStore {
  const object = (personId: string) =>
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(`data-keys/${personId}`)}`;
  const auth = async () => ({ authorization: `Bearer ${await token()}` });
  return {
    async create(personId, wrapped) {
      // ifGenerationMatch=0: written only if no object has that name yet.
      const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o`);
      url.searchParams.set('uploadType', 'media');
      url.searchParams.set('name', `data-keys/${personId}`);
      url.searchParams.set('ifGenerationMatch', '0');
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { ...(await auth()), 'content-type': 'application/octet-stream' },
        body: new Uint8Array(wrapped),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 412) return false;
      if (!res.ok) throw new CloudError('Cloud Storage upload', res.status);
      await res.body?.cancel();
      return true;
    },
    async read(personId) {
      const res = await fetchFn(`${object(personId)}?alt=media`, {
        headers: await auth(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new CloudError('Cloud Storage read', res.status);
      return Buffer.from(await res.arrayBuffer());
    },
    async destroy(personId) {
      const res = await fetchFn(object(personId), {
        method: 'DELETE',
        headers: await auth(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Already gone is gone.
      if (!res.ok && res.status !== 404) throw new CloudError('Cloud Storage delete', res.status);
      await res.body?.cancel();
    },
  };
}
