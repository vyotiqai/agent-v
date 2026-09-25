import { randomBytes } from 'node:crypto';

/**
 * Ids are random and never guessable (stage 6, section 17). They are UUID version 7: the first
 * 48 bits are the time in milliseconds, so new rows land at the end of an index instead of
 * scattering across it, and the remaining 74 bits are random.
 */
export function newId(now: number = Date.now()): string {
  const b = randomBytes(16);
  b.writeUIntBE(now, 0, 6);
  b[6] = ((b[6] as number) & 0x0f) | 0x70; // version 7
  b[8] = ((b[8] as number) & 0x3f) | 0x80; // RFC 9562 variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** True for a lower-case UUID, the only form our ids take. */
export function isId(value: string): boolean {
  return UUID.test(value);
}
