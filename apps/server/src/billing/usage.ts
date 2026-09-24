import type { Limits, Metric, PlanInfo, SubscriptionInfo, Usage } from "@agent-v/shared";
import { and, eq, inArray, like, ne, sql } from "drizzle-orm";
import type { PlanConfig } from "../config.ts";
import type { Context } from "../context.ts";
import {
  connectors,
  files,
  member,
  monitors,
  type SubjectType,
  subscriptions,
  usageCounters,
} from "../db/schema.ts";
import { AppError } from "../errors.ts";
import { countTokens } from "../telemetry.ts";

/** Counters stored per month; the rest are counted live. */
type Counted = "tokens" | "tasks" | "browserActions" | "computerSeconds" | "voiceSeconds";

export const periodOf = (date = new Date()) => date.toISOString().slice(0, 7);
function periodBounds(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

/** Add to this month's counters (one upsert for any number of metrics). */
export async function recordUsage(
  ctx: Context,
  userId: string,
  amounts: Partial<Record<Counted, number>> & { model?: string; input?: number; output?: number },
) {
  const period = periodOf();
  const rows: { userId: string; period: string; metric: string; amount: number }[] = [];
  for (const metric of [
    "tokens",
    "tasks",
    "browserActions",
    "computerSeconds",
    "voiceSeconds",
  ] as const) {
    const amount = Math.round(amounts[metric] ?? 0);
    if (amount > 0) rows.push({ userId, period, metric, amount });
  }
  if (amounts.model) {
    if (amounts.input)
      rows.push({ userId, period, metric: `input_tokens:${amounts.model}`, amount: amounts.input });
    if (amounts.output)
      rows.push({
        userId,
        period,
        metric: `output_tokens:${amounts.model}`,
        amount: amounts.output,
      });
  }
  if (!rows.length) return;
  if (amounts.model) countTokens(amounts.model, amounts.input ?? 0, amounts.output ?? 0);
  await ctx.db
    .insert(usageCounters)
    .values(rows)
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.period, usageCounters.metric],
      set: { amount: sql`${usageCounters.amount} + excluded.amount` },
    });
}

const planInfo = (ctx: Context, plan: PlanConfig): PlanInfo => ({
  id: plan.id,
  name: plan.name,
  price: plan.price,
  limits: plan.limits,
  purchasable: Boolean(ctx.config.stripe && plan.stripePrice),
  team: plan.team,
});

const liveStatuses = ["active", "trialing", "past_due"];

export function planById(ctx: Context, id: string) {
  return ctx.config.plans.list.find((p) => p.id === id);
}

/** The best plan among the person's grant, their own subscription and their team's. */
export async function effectivePlan(ctx: Context, userId: string) {
  const list = ctx.config.plans.list;
  const teams = await ctx.db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  const subjects = [
    and(eq(subscriptions.subjectType, "user"), eq(subscriptions.subjectId, userId)),
    ...(teams.length
      ? [
          and(
            eq(subscriptions.subjectType, "organization"),
            inArray(
              subscriptions.subjectId,
              teams.map((t) => t.organizationId),
            ),
          ),
        ]
      : []),
  ];
  const rows = await ctx.db
    .select()
    .from(subscriptions)
    .where(
      and(
        sql`(${sql.join(
          subjects.map((s) => sql`(${s})`),
          sql` or `,
        )})`,
        inArray(subscriptions.status, liveStatuses),
      ),
    );
  let best: { plan: PlanConfig; source: Usage["source"] } = {
    plan: list[0] as PlanConfig,
    source: "default",
  };
  for (const row of rows) {
    const index = list.findIndex((p) => p.id === row.plan);
    if (index > list.indexOf(best.plan))
      best = {
        plan: list[index] as PlanConfig,
        source:
          row.provider === "grant" ? "granted" : row.subjectType === "user" ? "personal" : "team",
      };
  }
  return best;
}

async function counters(ctx: Context, userId: string, period = periodOf()) {
  const rows = await ctx.db
    .select({ metric: usageCounters.metric, amount: usageCounters.amount })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.period, period)));
  return new Map(rows.map((r) => [r.metric, r.amount]));
}

async function liveCounts(ctx: Context, userId: string) {
  const [storage] = await ctx.db
    .select({ bytes: sql<string>`coalesce(sum(${files.size}), 0)` })
    .from(files)
    .where(eq(files.userId, userId));
  return {
    storageMb: Number(storage?.bytes ?? 0) / (1024 * 1024),
    connectors: await ctx.db.$count(connectors, eq(connectors.userId, userId)),
    watches: await ctx.db.$count(
      monitors,
      and(eq(monitors.userId, userId), ne(monitors.status, "stopped")),
    ),
  };
}

async function used(ctx: Context, userId: string): Promise<Record<Metric, number>> {
  const [c, live] = await Promise.all([counters(ctx, userId), liveCounts(ctx, userId)]);
  return {
    tokens: c.get("tokens") ?? 0,
    tasks: c.get("tasks") ?? 0,
    browserActions: c.get("browserActions") ?? 0,
    computerMinutes: Math.round((c.get("computerSeconds") ?? 0) / 6) / 10,
    voiceMinutes: Math.round((c.get("voiceSeconds") ?? 0) / 6) / 10,
    storageMb: Math.round(live.storageMb * 10) / 10,
    connectors: live.connectors,
    watches: live.watches,
  };
}

export function toSubscriptionInfo(
  row: typeof subscriptions.$inferSelect | undefined,
): SubscriptionInfo | null {
  if (!row) return null;
  return {
    plan: row.plan,
    status: row.status,
    seats: row.seats,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    managed: row.provider === "stripe",
  };
}

export async function subscriptionOf(ctx: Context, subjectType: SubjectType, subjectId: string) {
  const [row] = await ctx.db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.subjectType, subjectType),
        eq(subscriptions.subjectId, subjectId),
        eq(subscriptions.provider, "stripe"),
      ),
    );
  return row;
}

export async function getUsage(ctx: Context, userId: string): Promise<Usage> {
  const [{ plan, source }, usedNow, byModel, subscription] = await Promise.all([
    effectivePlan(ctx, userId),
    used(ctx, userId),
    ctx.db
      .select({ metric: usageCounters.metric, amount: usageCounters.amount })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.userId, userId),
          eq(usageCounters.period, periodOf()),
          like(usageCounters.metric, "%_tokens:%"),
        ),
      ),
    subscriptionOf(ctx, "user", userId),
  ]);
  const models = new Map<string, { model: string; input: number; output: number }>();
  for (const row of byModel) {
    const [kind, ...rest] = row.metric.split(":");
    const model = rest.join(":");
    const entry = models.get(model) ?? { model, input: 0, output: 0 };
    if (kind === "input_tokens") entry.input += row.amount;
    else entry.output += row.amount;
    models.set(model, entry);
  }
  const { start, end } = periodBounds();
  return {
    plan: planInfo(ctx, plan),
    source,
    enforced: ctx.config.plans.enforced,
    period: { start: start.toISOString(), end: end.toISOString() },
    used: usedNow,
    models: [...models.values()].sort((a, b) => b.input + b.output - (a.input + a.output)),
    billing: {
      available: Boolean(ctx.config.stripe),
      subscription: toSubscriptionInfo(subscription),
      plans: ctx.config.plans.list.map((p) => planInfo(ctx, p)),
    },
  };
}

// Quota checks run on hot paths (every chat turn), so the plan (never the counters) is cached.
const planCache = new Map<string, { at: number; limits: Limits; name: string }>();
const cacheMs = 30_000;

async function limitsFor(ctx: Context, userId: string) {
  const cached = planCache.get(userId);
  if (cached && Date.now() - cached.at < cacheMs) return cached;
  const { plan } = await effectivePlan(ctx, userId);
  const entry = { at: Date.now(), limits: plan.limits, name: plan.name };
  planCache.set(userId, entry);
  if (planCache.size > 10_000) planCache.clear();
  return entry;
}

/** Forget cached plans after a subscription or membership changes. */
export function forgetPlans(userIds?: string[]) {
  if (!userIds) planCache.clear();
  else for (const id of userIds) planCache.delete(id);
}

export class QuotaError extends AppError {
  readonly metric: Metric;
  constructor(message: string, metric: Metric) {
    super(message, 402);
    this.name = "QuotaError";
    this.metric = metric;
  }
}

const messages: Record<Metric, string> = {
  tokens: "You've used this month's AI allowance",
  tasks: "You've used this month's background tasks",
  browserActions: "You've used this month's browser actions",
  computerMinutes: "You've used this month's computer time",
  voiceMinutes: "You've used this month's voice input",
  storageMb: "Your file storage is full",
  connectors: "You've reached your plan's connector limit",
  watches: "You've reached your plan's watch limit",
};

/**
 * Refuse work that would go over the plan. `adding` is how much the action adds for counted
 * limits (1 for a new watch or connector); monthly limits refuse once the allowance is used.
 */
export async function assertQuota(
  ctx: Context,
  userId: string,
  metric: Metric,
  adding = 0,
): Promise<void> {
  if (!ctx.config.plans.enforced) return;
  const { limits, name } = await limitsFor(ctx, userId);
  const limit = limits[metric];
  if (limit === null) return;
  let current: number;
  if (metric === "storageMb" || metric === "connectors" || metric === "watches")
    current = (await liveCounts(ctx, userId))[metric];
  else {
    const c = await counters(ctx, userId);
    current =
      metric === "computerMinutes"
        ? (c.get("computerSeconds") ?? 0) / 60
        : metric === "voiceMinutes"
          ? (c.get("voiceSeconds") ?? 0) / 60
          : (c.get(metric) ?? 0);
  }
  if (current + adding > limit || (adding === 0 && current >= limit)) {
    const { end } = periodBounds();
    const monthly = !["storageMb", "connectors", "watches"].includes(metric);
    const when = end.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
    throw new QuotaError(
      `${messages[metric]} on the ${name} plan. ${monthly ? `It resets on ${when}, or upgrade` : "Upgrade"} to keep going.`,
      metric,
    );
  }
}

/** Whether a quota still has room, for background work that should skip rather than fail. */
export async function withinQuota(ctx: Context, userId: string, metric: Metric) {
  try {
    await assertQuota(ctx, userId, metric);
    return true;
  } catch (error) {
    if (error instanceof QuotaError) return false;
    throw error;
  }
}
