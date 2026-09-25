import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import type { Phone, PhoneInfo, Session } from '@agentv/shared/accounts.ts';
import type { Sql, Tx } from '../db/connect.ts';
import { newId } from '../ids.ts';
import type { Logger } from '../log.ts';
import type { GoogleIdentity } from './google.ts';

/**
 * Accounts, sessions and phones (stage 6, section 3; D96).
 *
 * - An access token lasts 15 minutes; a refresh token is used once and replaced. Both are random
 *   32-byte values, stored only as SHA-256 hashes, so a copy of the database signs no one in.
 * - A refresh token seen a second time was copied: the phone it belongs to is signed out.
 * - Each sign-in is one phone row, holding its session and the public half of its signing key.
 */

export const ACCESS_LIFETIME_MS = 15 * 60 * 1000;
export const NONCE_LIFETIME_MS = 10 * 60 * 1000;

const hash = (token: string): Buffer => createHash('sha256').update(token).digest();
const token = (): string => randomBytes(32).toString('base64url');

export class SignedOut extends Error {}
export class BadSigningKey extends Error {}

/** The phone's public key, as DER bytes, if it is a P-256 key; the chips on both phones make these. */
export function signingKeyBytes(base64: string): Buffer {
  const der = Buffer.from(base64, 'base64');
  let key: ReturnType<typeof createPublicKey>;
  try {
    key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    throw new BadSigningKey();
  }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new BadSigningKey();
  }
  return key.export({ format: 'der', type: 'spki' });
}

/** A one-time value for the next sign-in. */
export async function newNonce(sql: Sql): Promise<string> {
  const nonce = token();
  await sql`insert into sign_in_nonces (hash, expires_at)
            values (${hash(nonce)}, ${new Date(Date.now() + NONCE_LIFETIME_MS)})`;
  return nonce;
}

/** Uses up a nonce. False if it was never given, already used, or expired. */
export async function useNonce(sql: Sql, nonce: string): Promise<boolean> {
  const rows = await sql`delete from sign_in_nonces
                         where hash = ${hash(nonce)} and expires_at > now() returning 1`;
  return rows.length === 1;
}

async function issue(
  tx: Tx,
  phoneId: string,
): Promise<{ access: string; refresh: string; expires: Date }> {
  const access = token();
  const refresh = token();
  const expires = new Date(Date.now() + ACCESS_LIFETIME_MS);
  await tx`update phones set access_hash = ${hash(access)}, access_expires_at = ${expires}, last_used_at = now()
           where id = ${phoneId}`;
  await tx`insert into refresh_tokens (hash, phone_id) values (${hash(refresh)}, ${phoneId})`;
  return { access, refresh, expires };
}

async function event(
  tx: Tx,
  personId: string,
  phoneId: string | null,
  kind: string,
): Promise<void> {
  await tx`insert into security_events (id, person_id, phone_id, kind)
           values (${newId()}, ${personId}, ${phoneId}, ${kind})`;
}

/** Signs a person in with a checked Google identity, on a new phone row. */
export async function signInWithGoogle(
  sql: Sql,
  logger: Logger,
  who: GoogleIdentity,
  phone: PhoneInfo,
): Promise<Session> {
  const key = signingKeyBytes(phone.signingKey);
  return sql.begin(async (tx) => {
    await tx`insert into people (id, google_sub, name, email)
             values (${newId()}, ${who.sub}, ${who.name ?? ''}, ${who.email})
             on conflict (google_sub) do nothing`;
    const [person] = await tx<
      { id: string }[]
    >`select id from people where google_sub = ${who.sub}`;
    if (!person) throw new Error('The person vanished while signing in.');
    const phoneId = newId();
    await tx`insert into phones (id, person_id, platform, model, signing_key)
             values (${phoneId}, ${person.id}, ${phone.platform}, ${phone.model}, ${key})`;
    const t = await issue(tx, phoneId);
    await event(tx, person.id, phoneId, 'signed-in');
    logger.log('auth.signed-in', { personId: person.id });
    return {
      accessToken: t.access,
      accessExpiresAt: t.expires.toISOString(),
      refreshToken: t.refresh,
      personId: person.id,
      phoneId,
    };
  });
}

/**
 * Replaces a refresh token with a new pair. A token used before means it was copied: its phone is
 * signed out, and so is whoever holds the copy.
 */
export async function refresh(sql: Sql, logger: Logger, refreshToken: string): Promise<Session> {
  const result = await sql.begin(async (tx) => {
    const [row] = await tx<
      { phone_id: string; used_at: Date | null; person_id: string; signed_out_at: Date | null }[]
    >`select r.phone_id, r.used_at, p.person_id, p.signed_out_at
      from refresh_tokens r join phones p on p.id = r.phone_id
      where r.hash = ${hash(refreshToken)}
      for update of r, p`;
    if (!row || row.signed_out_at) return null;
    if (row.used_at) {
      await signOutRow(tx, row.phone_id, 'token-reused');
      await event(tx, row.person_id, row.phone_id, 'token-reused');
      logger.log('auth.token-reused', { personId: row.person_id });
      return null;
    }
    await tx`update refresh_tokens set used_at = now() where hash = ${hash(refreshToken)}`;
    const t = await issue(tx, row.phone_id);
    return {
      accessToken: t.access,
      accessExpiresAt: t.expires.toISOString(),
      refreshToken: t.refresh,
      personId: row.person_id,
      phoneId: row.phone_id,
    };
  });
  if (!result) throw new SignedOut();
  return result;
}

async function signOutRow(tx: Tx, phoneId: string, why: string): Promise<void> {
  await tx`update phones set signed_out_at = now(), signed_out_why = ${why},
                             access_hash = null, access_expires_at = null
           where id = ${phoneId} and signed_out_at is null`;
  await tx`delete from refresh_tokens where phone_id = ${phoneId}`;
}

export interface Caller {
  personId: string;
  phoneId: string;
}

/** Who a request's access token belongs to, or null if it's unknown, expired or signed out. */
export async function authenticate(sql: Sql, accessToken: string): Promise<Caller | null> {
  const [row] = await sql<{ id: string; person_id: string; last_used_at: Date }[]>`
    select id, person_id, last_used_at from phones
    where access_hash = ${hash(accessToken)} and access_expires_at > now() and signed_out_at is null`;
  if (!row) return null;
  // "Last used" is shown to the minute; writing it more often is wasted work.
  if (Date.now() - row.last_used_at.getTime() > 60_000) {
    await sql`update phones set last_used_at = now() where id = ${row.id}`;
  }
  return { personId: row.person_id, phoneId: row.id };
}

/** Signs out the phone making the request. */
export async function signOut(sql: Sql, logger: Logger, caller: Caller): Promise<void> {
  await sql.begin(async (tx) => {
    await signOutRow(tx, caller.phoneId, 'signed-out');
    await event(tx, caller.personId, caller.phoneId, 'signed-out');
  });
  logger.log('auth.signed-out', { personId: caller.personId });
}

/** Signs out another of the person's phones (D137). False if it isn't theirs or is already out. */
export async function signOutPhone(
  sql: Sql,
  logger: Logger,
  caller: Caller,
  phoneId: string,
): Promise<boolean> {
  const done = await sql.begin(async (tx) => {
    const rows = await tx`select 1 from phones
                          where id = ${phoneId} and person_id = ${caller.personId} and signed_out_at is null
                          for update`;
    if (rows.length === 0) return false;
    await signOutRow(tx, phoneId, 'signed-out-elsewhere');
    await event(tx, caller.personId, phoneId, 'phone-signed-out');
    return true;
  });
  if (done) logger.log('auth.phone-signed-out', { personId: caller.personId });
  return done;
}

/** The person's signed-in phones, the one asking first, then the most recently used. */
export async function phones(sql: Sql, caller: Caller): Promise<Phone[]> {
  const rows = await sql<
    {
      id: string;
      platform: 'android' | 'ios';
      model: string;
      signed_in_at: Date;
      last_used_at: Date;
    }[]
  >`select id, platform, model, signed_in_at, last_used_at from phones
    where person_id = ${caller.personId} and signed_out_at is null
    order by (id = ${caller.phoneId}) desc, last_used_at desc`;
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    model: r.model,
    signedInAt: r.signed_in_at.toISOString(),
    lastUsedAt: r.last_used_at.toISOString(),
    current: r.id === caller.phoneId,
  }));
}

/** Deletes spent nonces and old rate-limit counters. Run every few minutes. */
export async function tidy(sql: Sql): Promise<void> {
  await sql`delete from sign_in_nonces where expires_at < now()`;
  await sql`delete from rate_limits where window_start < now() - interval '1 hour'`;
}
