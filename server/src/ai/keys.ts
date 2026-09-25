import type {
  AddKeyRequest,
  AiKey,
  AiModel,
  AiProvider,
  AiView,
  ChooseModelsRequest,
  KeyProblem,
  KeyStatus,
  Me,
} from '@agentv/shared/ai.ts';
import type { DataKeys } from '../crypto/envelope.ts';
import { open, seal } from '../crypto/envelope.ts';
import type { Sql, Tx } from '../db/connect.ts';
import { newId } from '../ids.ts';
import type { Logger } from '../log.ts';
import { costMicros, known, recommended } from './catalog.ts';
import { type ModelInfo, type ProviderClient, ProviderError, type Usage } from './types.ts';

/**
 * The person's AI keys, their chosen models, their monthly limit and their search key (stage 6,
 * section 5; slice 2).
 *
 * A key is kept only if it works: it is tested with a real, small call first, and the model
 * list is read from the provider. It is then sealed with the person's data key (D107), bound to
 * whose it is and what for, and never leaves the server again; only its last four characters are
 * kept readable. Nothing about a key, a model's answer or a person's settings is logged.
 */

export interface AiDeps {
  sql: Sql;
  dataKeys: DataKeys;
  logger: Logger;
  /** The client for a provider, and for another provider, its address. */
  client: (provider: AiProvider, baseUrl: string | null) => ProviderClient;
  /** A real search with a Brave key, for checking it. */
  search: (key: string) => Promise<unknown>;
}

export type Outcome = { ok: true; view: AiView } | { ok: false; problem: KeyProblem };

/** A key's test call: a few words, so it costs a fraction of a cent. */
const TEST_TOKENS = 16;
const CALL_TIMEOUT_MS = 60_000;

const NAMES: Record<Exclude<AiProvider, 'compatible'>, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

// What a sealed key is bound to: whose it is, and which provider and address it is for.
const keyContext = (personId: string, provider: AiProvider, baseUrl: string | null) =>
  `agent-v/ai-key/${personId}/${provider}/${baseUrl ?? ''}`;
const searchContext = (personId: string) => `agent-v/search-key/${personId}`;

const hint = (key: string) => key.slice(-4);

// ---------------------------------------------------------------- keys

export async function addKey(deps: AiDeps, personId: string, req: AddKeyRequest): Promise<Outcome> {
  const baseUrl = req.baseUrl ?? null;
  const client = deps.client(req.provider, baseUrl);
  const tried = await tryKey(client, req.key, req.model);
  if (!tried.ok) {
    deps.logger.log('ai.key-refused', { personId, errorKind: tried.problem });
    return tried;
  }
  const dataKey = await deps.dataKeys.forPerson(personId);
  const sealed = seal(
    dataKey,
    Buffer.from(req.key, 'utf8'),
    keyContext(personId, req.provider, baseUrl),
  );
  const { sql } = deps;
  await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into ai_keys (id, person_id, provider, base_url, key_sealed, key_hint, status, checked_at, models)
      values (${newId()}, ${personId}, ${req.provider}, ${baseUrl}, ${sealed}, ${hint(req.key)},
              'working', now(), ${tx.json(tried.models as never)})
      on conflict (person_id, provider, (coalesce(base_url, ''))) do update
        set key_sealed = excluded.key_sealed, key_hint = excluded.key_hint, status = 'working',
            checked_at = now(), models = excluded.models
      returning id`;
    const keyId = (row as { id: string }).id;
    await recordUsage(tx, personId, keyId, req.provider, tried.model, tried.usage);
    // The first key, or a key after the chosen ones were removed, gets the recommended models.
    const jobs = pick(req.provider, tried.models, 'jobs') ?? tried.model;
    const quick = pick(req.provider, tried.models, 'quick') ?? tried.model;
    await tx`insert into ai_settings (person_id) values (${personId}) on conflict do nothing`;
    await tx`
      update ai_settings set
        jobs_key_id = coalesce(jobs_key_id, ${keyId}),
        jobs_model = coalesce(jobs_model, ${jobs}),
        quick_key_id = coalesce(quick_key_id, ${keyId}),
        quick_model = coalesce(quick_model, ${quick})
      where person_id = ${personId}`;
  });
  deps.logger.log('ai.key-saved', { personId });
  return { ok: true, view: await aiView(deps.sql, personId) };
}

/** Tests a kept key again ("Test the key again"); a declined key or one out of credit says so. */
export async function checkKey(
  deps: AiDeps,
  personId: string,
  keyId: string,
): Promise<Outcome | null> {
  const { sql } = deps;
  const [row] = await sql<{ provider: AiProvider; base_url: string | null; key_sealed: Buffer }[]>`
    select provider, base_url, key_sealed from ai_keys where id = ${keyId} and person_id = ${personId}`;
  if (!row) return null;
  const key = await openKey(
    deps,
    personId,
    row.key_sealed,
    keyContext(personId, row.provider, row.base_url),
  );
  const [settings] = await sql<{ model: string | null }[]>`
    select case when jobs_key_id = ${keyId} then jobs_model
                when quick_key_id = ${keyId} then quick_model end as model
    from ai_settings where person_id = ${personId}`;
  const tried = await tryKey(
    deps.client(row.provider, row.base_url),
    key,
    settings?.model ?? undefined,
  );
  if (!tried.ok) {
    // Only the key's own standing is kept; a provider that couldn't be reached says nothing about it.
    if (tried.problem === 'declined' || tried.problem === 'no-credit') {
      await sql`update ai_keys set status = ${tried.problem}, checked_at = now() where id = ${keyId}`;
    }
    deps.logger.log('ai.key-refused', { personId, errorKind: tried.problem });
    return tried;
  }
  await sql.begin(async (tx) => {
    await tx`
      update ai_keys set status = 'working', checked_at = now(), models = ${tx.json(tried.models as never)}
      where id = ${keyId}`;
    await recordUsage(tx, personId, keyId, row.provider, tried.model, tried.usage);
  });
  return { ok: true, view: await aiView(sql, personId) };
}

/** Removes a key: its sealed copy is deleted at once. Models chosen from it are unset. */
export async function removeKey(deps: AiDeps, personId: string, keyId: string): Promise<boolean> {
  const removed = await deps.sql.begin(async (tx) => {
    // The choices made from this key go first: a model is never left without its key.
    await tx`
      update ai_settings set
        jobs_key_id = case when jobs_key_id = ${keyId} then null else jobs_key_id end,
        jobs_model = case when jobs_key_id = ${keyId} then null else jobs_model end,
        quick_key_id = case when quick_key_id = ${keyId} then null else quick_key_id end,
        quick_model = case when quick_key_id = ${keyId} then null else quick_model end
      where person_id = ${personId}`;
    return tx`delete from ai_keys where id = ${keyId} and person_id = ${personId}`;
  });
  if (removed.count === 0) return false;
  deps.logger.log('ai.key-removed', { personId });
  return true;
}

// ---------------------------------------------------------------- models, limit, search key

/**
 * Chooses the models for jobs and quick steps, from the person's own keys' lists. A model that
 * can't call tools can't be picked for jobs (stage 1, section 8).
 */
export async function chooseModels(
  sql: Sql,
  personId: string,
  req: ChooseModelsRequest,
): Promise<'ok' | 'bad-request'> {
  const rows = await sql<{ id: string; models: AiModel[] }[]>`
    select id, models from ai_keys where person_id = ${personId}
      and id in ${sql([req.jobs.keyId, req.quick.keyId])}`;
  const find = (c: { keyId: string; model: string }) =>
    rows.find((r) => r.id === c.keyId)?.models.find((m) => m.id === c.model);
  const jobs = find(req.jobs);
  const quick = find(req.quick);
  if (!jobs || !quick || jobs.tools === false) return 'bad-request';
  await sql`insert into ai_settings (person_id) values (${personId}) on conflict do nothing`;
  await sql`
    update ai_settings set jobs_key_id = ${req.jobs.keyId}, jobs_model = ${req.jobs.model},
      quick_key_id = ${req.quick.keyId}, quick_model = ${req.quick.model}
    where person_id = ${personId}`;
  return 'ok';
}

export async function setLimit(sql: Sql, personId: string, cents: number): Promise<void> {
  await sql`
    insert into ai_settings (person_id, monthly_limit_cents) values (${personId}, ${cents})
    on conflict (person_id) do update set monthly_limit_cents = excluded.monthly_limit_cents`;
}

/** Keeps a Brave Search key once a real search with it works. */
export async function setSearchKey(deps: AiDeps, personId: string, key: string): Promise<Outcome> {
  try {
    await deps.search(key);
  } catch (err) {
    const problem = problemOf(err);
    deps.logger.log('ai.key-refused', { personId, errorKind: problem });
    return { ok: false, problem };
  }
  const dataKey = await deps.dataKeys.forPerson(personId);
  const sealed = seal(dataKey, Buffer.from(key, 'utf8'), searchContext(personId));
  await deps.sql`
    insert into search_keys (person_id, key_sealed, key_hint, status, checked_at)
    values (${personId}, ${sealed}, ${hint(key)}, 'working', now())
    on conflict (person_id) do update set key_sealed = excluded.key_sealed,
      key_hint = excluded.key_hint, status = 'working', checked_at = now()`;
  deps.logger.log('ai.key-saved', { personId });
  return { ok: true, view: await aiView(deps.sql, personId) };
}

export async function removeSearchKey(deps: AiDeps, personId: string): Promise<void> {
  await deps.sql`delete from search_keys where person_id = ${personId}`;
  deps.logger.log('ai.key-removed', { personId });
}

// ---------------------------------------------------------------- the person

export async function me(sql: Sql, personId: string): Promise<Me> {
  const [row] = await sql<{ name: string; email: string | null; time_zone: string }[]>`
    select name, email, time_zone from people where id = ${personId}`;
  if (!row) throw new Error('The signed-in person has no row.');
  return { name: row.name, email: row.email, timeZone: row.time_zone };
}

/** Keeps the phone's time zone, if it is one the database knows; false if it isn't. */
export async function setTimeZone(sql: Sql, personId: string, timeZone: string): Promise<boolean> {
  const [known] = await sql`select 1 from pg_timezone_names where name = ${timeZone}`;
  if (!known) return false;
  await sql`update people set time_zone = ${timeZone} where id = ${personId}`;
  return true;
}

// ---------------------------------------------------------------- the view

export async function aiView(sql: Sql, personId: string): Promise<AiView> {
  const keys = await sql<
    {
      id: string;
      provider: AiProvider;
      base_url: string | null;
      key_hint: string;
      status: KeyStatus;
      checked_at: Date;
      models: AiModel[];
    }[]
  >`
    select id, provider, base_url, key_hint, status, checked_at, models
    from ai_keys where person_id = ${personId} order by created_at, id`;
  const [settings] = await sql<
    {
      jobs_key_id: string | null;
      jobs_model: string | null;
      quick_key_id: string | null;
      quick_model: string | null;
      monthly_limit_cents: number;
    }[]
  >`select * from ai_settings where person_id = ${personId}`;
  // The month runs in the person's own time zone.
  const [month] = await sql<{ spent: string; ends: Date }[]>`
    select coalesce(sum(u.cost_micros), 0) as spent,
      (date_trunc('month', now() at time zone p.time_zone) + interval '1 month') at time zone p.time_zone as ends
    from people p
    left join ai_usage u on u.person_id = p.id
      and u.at >= date_trunc('month', now() at time zone p.time_zone) at time zone p.time_zone
    where p.id = ${personId}
    group by p.time_zone`;
  const [search] = await sql<{ key_hint: string; status: KeyStatus; checked_at: Date }[]>`
    select key_hint, status, checked_at from search_keys where person_id = ${personId}`;
  return {
    keys: keys.map(
      (k): AiKey => ({
        id: k.id,
        provider: k.provider,
        name: k.provider === 'compatible' ? new URL(k.base_url ?? '').hostname : NAMES[k.provider],
        baseUrl: k.base_url,
        keyHint: k.key_hint,
        status: k.status,
        checkedAt: k.checked_at.toISOString(),
        models: k.models,
      }),
    ),
    jobs:
      settings?.jobs_key_id && settings.jobs_model
        ? { keyId: settings.jobs_key_id, model: settings.jobs_model }
        : null,
    quick:
      settings?.quick_key_id && settings.quick_model
        ? { keyId: settings.quick_key_id, model: settings.quick_model }
        : null,
    monthlyLimitCents: settings?.monthly_limit_cents ?? 2000,
    spentThisMonthMicros: Number(month?.spent ?? 0),
    monthEndsAt: (month?.ends ?? new Date()).toISOString(),
    search: search
      ? {
          keyHint: search.key_hint,
          status: search.status,
          checkedAt: search.checked_at.toISOString(),
        }
      : null,
  };
}

// ---------------------------------------------------------------- inside

type Tried =
  | { ok: true; models: AiModel[]; model: string; usage: Usage | null }
  | { ok: false; problem: KeyProblem };

/**
 * Reads the model list and makes one real, small call. Another provider's server may not list
 * its models; then the model the person named is the list.
 */
async function tryKey(client: ProviderClient, key: string, wanted?: string): Promise<Tried> {
  const signal = AbortSignal.timeout(CALL_TIMEOUT_MS);
  let listed: ModelInfo[];
  try {
    listed = await client.models(key, signal);
  } catch (err) {
    const problem = problemOf(err);
    if (
      client.provider !== 'compatible' ||
      !wanted ||
      (problem !== 'model-gone' && problem !== 'bad-request')
    ) {
      return { ok: false, problem };
    }
    listed = [
      { id: wanted, name: wanted, tools: null, contextTokens: null, maxOutputTokens: null },
    ];
  }
  const models = listed.map((m) => describe(client.provider, m));
  if (wanted && client.provider === 'compatible' && !models.some((m) => m.id === wanted)) {
    return { ok: false, problem: 'model-gone' };
  }
  const model = wanted ?? testModel(client.provider, models);
  if (!model) return { ok: false, problem: 'model-gone' };
  try {
    for await (const e of client.stream(key, {
      model,
      turns: [{ role: 'user', parts: [{ type: 'text', text: 'Reply with the word: ok' }] }],
      maxOutputTokens: TEST_TOKENS,
      signal,
    })) {
      if (e.type === 'end') return { ok: true, models, model, usage: e.usage };
    }
    return { ok: false, problem: 'provider-down' };
  } catch (err) {
    return { ok: false, problem: problemOf(err) };
  }
}

/** A provider's model, with what our catalog knows about it. */
function describe(provider: AiProvider, m: ModelInfo): AiModel {
  const k = known(provider, m.id);
  return {
    id: m.id,
    name: k?.name ?? m.name,
    tools: k ? true : m.tools,
    role: k?.role ?? null,
    hint: k?.hint ?? null,
    price: k ? { input: k.price.input, output: k.price.output } : null,
  };
}

/** The cheapest model we know the key can use, to test it with. */
function testModel(provider: AiProvider, models: AiModel[]): string | undefined {
  const ids = new Set(models.map((m) => m.id));
  for (const role of ['quick', 'jobs', 'jobs-more'] as const) {
    const m = recommended(provider, role);
    if (m && ids.has(m.id)) return m.id;
  }
  return models.find((m) => m.tools !== false)?.id;
}

/** The recommended model for a role, if the key's list has it. */
function pick(provider: AiProvider, models: AiModel[], role: 'jobs' | 'quick'): string | undefined {
  const m = recommended(provider, role);
  return m && models.some((x) => x.id === m.id) ? m.id : undefined;
}

function problemOf(err: unknown): KeyProblem {
  if (err instanceof ProviderError) return err.kind;
  // The call's own time ran out.
  if (err instanceof DOMException && err.name === 'TimeoutError') return 'unreachable';
  throw err;
}

async function openKey(
  deps: AiDeps,
  personId: string,
  sealed: Buffer,
  context: string,
): Promise<string> {
  const dataKey = await deps.dataKeys.existing(personId);
  if (!dataKey) throw new Error("The person's data key is gone.");
  return open(dataKey, sealed, context).toString('utf8');
}

async function recordUsage(
  sql: Sql | Tx,
  personId: string,
  keyId: string,
  provider: AiProvider,
  model: string,
  usage: Usage | null,
): Promise<void> {
  const price = known(provider, model)?.price;
  await sql`
    insert into ai_usage (id, person_id, key_id, provider, model, purpose, input_tokens,
      cached_tokens, cache_write_tokens, output_tokens, cost_micros)
    values (${newId()}, ${personId}, ${keyId}, ${provider}, ${model}, 'key-check',
      ${usage?.input ?? null}, ${usage?.cachedInput ?? null}, ${usage?.cacheWrite ?? null},
      ${usage?.output ?? null}, ${costMicros(price, usage)})`;
}
