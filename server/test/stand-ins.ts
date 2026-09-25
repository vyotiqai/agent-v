import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AiDeps } from '../src/ai/keys.ts';
import { DataKeys, type KeyWrapper, type WrappedKeyStore } from '../src/crypto/envelope.ts';
import type { Logger } from '../src/log.ts';

/**
 * Stand-ins for Cloud KMS and the key bucket, used only by tests. The real clients
 * (src/crypto/cloud.ts) are checked against Google Cloud itself on staging.
 */
export class LocalWrapper implements KeyWrapper {
  readonly #kek = randomBytes(32);
  async wrap(dataKey: Buffer, context: string): Promise<Buffer> {
    const nonce = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.#kek, nonce).setAAD(Buffer.from(context));
    const body = Buffer.concat([c.update(dataKey), c.final()]);
    return Buffer.concat([nonce, body, c.getAuthTag()]);
  }
  async unwrap(wrapped: Buffer, context: string): Promise<Buffer> {
    const d = createDecipheriv('aes-256-gcm', this.#kek, wrapped.subarray(0, 12)).setAAD(
      Buffer.from(context),
    );
    d.setAuthTag(wrapped.subarray(wrapped.length - 16));
    return Buffer.concat([d.update(wrapped.subarray(12, wrapped.length - 16)), d.final()]);
  }
}

export class MemoryStore implements WrappedKeyStore {
  readonly keys = new Map<string, Buffer>();
  async create(personId: string, wrapped: Buffer): Promise<boolean> {
    await Promise.resolve();
    if (this.keys.has(personId)) return false;
    this.keys.set(personId, wrapped);
    return true;
  }
  async read(personId: string): Promise<Buffer | null> {
    return this.keys.get(personId) ?? null;
  }
  async destroy(personId: string): Promise<void> {
    this.keys.delete(personId);
  }
}

/** Your AI's outside parts for API tests that don't use them: any call is a test failure. */
export function unusedAi(logger: Logger): Omit<AiDeps, 'sql' | 'logger'> {
  const unused = () => {
    throw new Error('This test does not use Your AI.');
  };
  return {
    dataKeys: new DataKeys(new LocalWrapper(), new MemoryStore(), logger),
    client: unused,
    search: unused,
  };
}
