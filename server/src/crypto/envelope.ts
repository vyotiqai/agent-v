import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Logger } from '../log.ts';

/**
 * Envelope encryption with a data key per person (stage 6, sections 5 and 17; D107).
 *
 * Each person's secrets (AI and search keys, account tokens, saved-login profiles) are sealed with
 * that person's own 256-bit data key, using AES-256-GCM. The data key itself is kept only wrapped:
 * encrypted by a key in Cloud KMS that never leaves Google's hardware. So a copy of the database,
 * or of a bucket, reveals no secret on its own.
 *
 * Wrapped data keys are kept outside the database, in a store where deletion is final (D126): a
 * bucket with no soft delete and no versions. Destroying a person's data key there makes every
 * copy of their secrets unreadable at once, including the copies in database backups, which is
 * what deleting an account promises (J10, D110).
 */

/** Wraps and unwraps data keys. In production, Cloud KMS. */
export interface KeyWrapper {
  wrap(dataKey: Buffer, context: string): Promise<Buffer>;
  unwrap(wrapped: Buffer, context: string): Promise<Buffer>;
}

/** Where wrapped data keys are kept, one per person. In production, a bucket (D126). */
export interface WrappedKeyStore {
  /** Stores a new key; returns false, changing nothing, if the person already has one. */
  create(personId: string, wrapped: Buffer): Promise<boolean>;
  read(personId: string): Promise<Buffer | null>;
  destroy(personId: string): Promise<void>;
}

const VERSION = 1;
const NONCE = 12;
const TAG = 16;

/** Seals plaintext with a data key. `context` names what it is and whose, and must match to open. */
export function seal(dataKey: Buffer, plaintext: Buffer, context: string): Buffer {
  const nonce = randomBytes(NONCE);
  const cipher = createCipheriv('aes-256-gcm', dataKey, nonce, { authTagLength: TAG });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.of(VERSION), nonce, body, cipher.getAuthTag()]);
}

/** Opens what `seal` made. Throws if the key, the context or a single byte is wrong. */
export function open(dataKey: Buffer, sealed: Buffer, context: string): Buffer {
  if (sealed.length < 1 + NONCE + TAG || sealed[0] !== VERSION) {
    throw new Error('Not a sealed value of a known version.');
  }
  const nonce = sealed.subarray(1, 1 + NONCE);
  const body = sealed.subarray(1 + NONCE, sealed.length - TAG);
  const decipher = createDecipheriv('aes-256-gcm', dataKey, nonce, { authTagLength: TAG });
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG));
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/** Binds a wrapped data key to its person, so one person's key can't be passed off as another's. */
function wrapContext(personId: string): string {
  return `agent-v/data-key/${personId}`;
}

export class DataKeys {
  readonly #wrapper: KeyWrapper;
  readonly #store: WrappedKeyStore;
  readonly #logger: Logger;

  constructor(wrapper: KeyWrapper, store: WrappedKeyStore, logger: Logger) {
    this.#wrapper = wrapper;
    this.#store = store;
    this.#logger = logger;
  }

  /** The person's data key, made the first time it's needed. For storing a new secret. */
  async forPerson(personId: string): Promise<Buffer> {
    const existing = await this.existing(personId);
    if (existing) return existing;
    const dataKey = randomBytes(32);
    const wrapped = await this.#wrapper.wrap(dataKey, wrapContext(personId));
    if (await this.#store.create(personId, wrapped)) {
      this.#logger.log('datakey.created', { personId });
      return dataKey;
    }
    // Another process made it first: use theirs, so every secret has the same key.
    const theirs = await this.existing(personId);
    if (!theirs) throw new Error('The data key vanished while it was being made.');
    return theirs;
  }

  /** The person's data key, or null if they have none, or it was destroyed. For reading secrets. */
  async existing(personId: string): Promise<Buffer | null> {
    const wrapped = await this.#store.read(personId);
    return wrapped ? this.#wrapper.unwrap(wrapped, wrapContext(personId)) : null;
  }

  /** Destroys the person's data key: every secret sealed with it becomes unreadable, for good. */
  async destroy(personId: string): Promise<void> {
    await this.#store.destroy(personId);
    this.#logger.log('datakey.destroyed', { personId });
  }
}
