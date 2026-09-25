-- Slice 2: the person's AI keys, their chosen models and monthly limit, what their calls used,
-- and their search key. Stage 6, section 5 (AI providers) and section 12 (the data model).

-- The person's time zone, which says when their month begins for the monthly limit. The phone
-- sends it (the app keeps it current).
alter table people add column time_zone text not null default 'UTC';

-- An AI key: one per provider, or per address for another provider. The key itself is kept only
-- sealed with the person's data key (D107), bound to this row's id; only its last four
-- characters are kept readable, to be shown again. The model list is what the provider offered
-- when the key was last checked.
create table ai_keys (
  id uuid primary key,
  person_id uuid not null references people (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'google', 'compatible')),
  base_url text,
  key_sealed bytea not null,
  key_hint text not null,
  status text not null check (status in ('working', 'declined', 'no-credit')),
  checked_at timestamptz not null,
  models jsonb not null,
  created_at timestamptz not null default now(),
  constraint ai_keys_base_url check ((provider = 'compatible') = (base_url is not null))
);
create unique index ai_keys_one_each on ai_keys (person_id, provider, coalesce(base_url, ''));

-- The models chosen for jobs and for quick steps, and the monthly limit (D52).
create table ai_settings (
  person_id uuid primary key references people (id) on delete cascade,
  jobs_key_id uuid references ai_keys (id) on delete set null,
  jobs_model text,
  quick_key_id uuid references ai_keys (id) on delete set null,
  quick_model text,
  monthly_limit_cents integer not null default 2000 check (monthly_limit_cents between 100 and 100000),
  constraint ai_settings_jobs check ((jobs_key_id is null) = (jobs_model is null)),
  constraint ai_settings_quick check ((quick_key_id is null) = (quick_model is null))
);

-- What each call to a person's AI used, and its estimated cost in millionths of a dollar. Null
-- where the provider didn't report usage, or the model's price isn't known. Checking a key is
-- the only kind of call until jobs arrive in slice 3.
create table ai_usage (
  id uuid primary key,
  person_id uuid not null references people (id) on delete cascade,
  key_id uuid references ai_keys (id) on delete set null,
  provider text not null,
  model text not null,
  purpose text not null check (purpose in ('key-check')),
  at timestamptz not null default now(),
  input_tokens integer,
  cached_tokens integer,
  cache_write_tokens integer,
  output_tokens integer,
  cost_micros bigint
);
create index ai_usage_person_at on ai_usage (person_id, at);

-- The person's Brave Search key (stage 6, section 16), kept like an AI key.
create table search_keys (
  person_id uuid primary key references people (id) on delete cascade,
  key_sealed bytea not null,
  key_hint text not null,
  status text not null check (status in ('working', 'declined', 'no-credit')),
  checked_at timestamptz not null
);
