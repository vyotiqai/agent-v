-- Slice 1: people, their phones, sessions, sign-in nonces, rate limits and security events.
-- Stage 6, section 3 (sign-in and sessions) and section 12 (the data model).

-- A person. Tied to the stable id inside Apple's or Google's identity token, never to the email,
-- which can change or be hidden (D100).
create table people (
  id uuid primary key,
  google_sub text unique,
  apple_sub text unique,
  name text not null default '',
  email text,
  created_at timestamptz not null default now(),
  constraint people_signs_in check (google_sub is not null or apple_sub is not null)
);

-- A phone signed in to an account: one row per sign-in, so a phone that signs out and in again
-- is a new row with a new signing key. The row is also the session: its access token (hashed)
-- and when that expires. Tokens are stored only as SHA-256 hashes (stage 6, section 17).
create table phones (
  id uuid primary key,
  person_id uuid not null references people (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  model text not null,
  -- The public half of the phone's signing key (P-256, SPKI DER), for Spend and Can't undo (D92).
  signing_key bytea not null,
  access_hash bytea unique,
  access_expires_at timestamptz,
  signed_in_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  signed_out_at timestamptz,
  signed_out_why text check (signed_out_why in ('signed-out', 'signed-out-elsewhere', 'token-reused')),
  constraint phones_signed_out check ((signed_out_at is null) = (signed_out_why is null))
);
create index phones_signed_in on phones (person_id) where signed_out_at is null;

-- Refresh tokens rotate on every use (D96). A used one is kept, marked, so that seeing it again
-- is recognised as a copy: the phone it belonged to is signed out.
create table refresh_tokens (
  hash bytea primary key,
  phone_id uuid not null references phones (id) on delete cascade,
  issued_at timestamptz not null default now(),
  used_at timestamptz
);
create index refresh_tokens_phone on refresh_tokens (phone_id);

-- One-time values a sign-in must carry inside Google's token, so a token can't be replayed.
create table sign_in_nonces (
  hash bytea primary key,
  expires_at timestamptz not null
);

-- Counters for rate limits (stage 6, section 17), one row per key and minute.
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null,
  primary key (key, window_start)
);

-- What happened to an account, shown to the person in You → Privacy (stage 6, section 17) and
-- part of their export. Kinds only: no content.
create table security_events (
  id uuid primary key,
  person_id uuid not null references people (id) on delete cascade,
  phone_id uuid references phones (id) on delete set null,
  kind text not null check (kind in ('signed-in', 'signed-out', 'phone-signed-out', 'token-reused')),
  at timestamptz not null default now()
);
create index security_events_person on security_events (person_id, at desc);
