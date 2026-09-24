import { createHash } from "node:crypto";
import { BlockedDestinationError, parseWebUrl } from "@agent-v/net";
import {
  type Monitor,
  type MonitorCheck,
  type MonitorDetail,
  type MonitorInput,
  type MonitorOutcome,
  monitorInputSchema,
} from "@agent-v/shared";
import { and, desc, eq, inArray, lte, notInArray, sql } from "drizzle-orm";
import { type Context, iso, newId } from "../context.ts";
import { demoPages, goals, monitorChecks, monitors } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";
import { parseAmount } from "../finance/analyze.ts";
import { readWebPage } from "../tools/web.ts";
import { notify } from "../workspace.ts";

const maxMonitors = 50;
const maxFailures = 5;
const keptChecks = 50;
const maxText = 20_000;

export const toMonitor = (row: typeof monitors.$inferSelect): Monitor => ({
  id: row.id,
  title: row.title,
  url: row.url,
  condition: row.condition,
  value: row.value,
  currency: row.currency,
  intervalMinutes: row.intervalMinutes,
  status: row.status,
  goalId: row.goalId,
  nextCheckAt: iso(row.nextCheckAt),
  lastCheckedAt: iso(row.lastCheckedAt),
  lastExcerpt: row.lastExcerpt.slice(0, 600),
  lastPrice: row.lastPrice === null ? null : Number(row.lastPrice),
  matched: row.matched,
  failures: row.failures,
  error: row.error,
  checks: row.checks,
  createdAt: row.createdAt.toISOString(),
});

const toCheck = (row: typeof monitorChecks.$inferSelect): MonitorCheck => ({
  id: row.id,
  monitorId: row.monitorId,
  outcome: row.outcome,
  detail: row.detail,
  price: row.price === null ? null : Number(row.price),
  createdAt: row.createdAt.toISOString(),
});

// Built-in pages for trying watches offline. Each user has their own editable copy.
export const demoPageDefaults: Record<string, { title: string; text: string }> = {
  availability: {
    title: "Harbor Bistro reservations",
    text: "Harbor Bistro\nReservations for Saturday\n7:00 PM: Fully booked. Check again later.",
  },
  price: {
    title: "Quiet Comfort headphones",
    text: "Quiet Comfort noise-cancelling headphones\nPrice: $349.00\nFree shipping on orders over $50.",
  },
};

function checkSource(ctx: Context, raw: string) {
  if (raw.startsWith("demo://")) {
    if (!ctx.config.demoWorkspace) throw new AppError("Demo pages are turned off", 422);
    if (!demoPageDefaults[raw.slice("demo://".length)])
      throw new AppError("Unknown demo page", 422);
    return raw;
  }
  try {
    return parseWebUrl(raw).toString();
  } catch (error) {
    if (error instanceof BlockedDestinationError) throw new AppError(error.message, 422);
    throw error;
  }
}

async function getMonitorRow(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
  if (!row) throw notFound("Watch");
  return row;
}

export async function listMonitors(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(monitors)
    .where(eq(monitors.userId, userId))
    .orderBy(desc(monitors.createdAt))
    .limit(maxMonitors * 2);
  return rows.map(toMonitor);
}

export async function getMonitorDetail(
  ctx: Context,
  userId: string,
  id: string,
): Promise<MonitorDetail> {
  const row = await getMonitorRow(ctx, userId, id);
  const checks = await ctx.db
    .select()
    .from(monitorChecks)
    .where(and(eq(monitorChecks.monitorId, id), eq(monitorChecks.userId, userId)))
    .orderBy(desc(monitorChecks.createdAt))
    .limit(keptChecks);
  return { monitor: toMonitor(row), checks: checks.map(toCheck) };
}

export async function createMonitor(ctx: Context, userId: string, raw: MonitorInput) {
  const input = monitorInputSchema.parse(raw);
  const url = checkSource(ctx, input.url);
  const running = await ctx.db.$count(
    monitors,
    and(eq(monitors.userId, userId), notInArray(monitors.status, ["stopped"])),
  );
  if (running >= maxMonitors)
    throw new AppError(`Keep at most ${maxMonitors} watches. Stop one first.`, 429);
  if (input.goalId) {
    const [goal] = await ctx.db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.id, input.goalId), eq(goals.userId, userId)));
    if (!goal) throw notFound("Goal");
  }
  const [row] = await ctx.db
    .insert(monitors)
    .values({
      id: newId(),
      userId,
      goalId: input.goalId,
      title: input.title,
      url,
      condition: input.condition,
      value: input.condition === "price_below" ? String(Number(input.value)) : input.value,
      currency: input.condition === "price_below" ? input.currency : null,
      intervalMinutes: input.intervalMinutes,
      nextCheckAt: new Date(),
    })
    .returning();
  if (!row) throw new AppError("The watch could not be saved", 500);
  await ctx.realtime.publish(userId, { type: "monitor", id: row.id });
  // The first check runs right away and records the starting point.
  await ctx.monitors?.enqueue(userId, row.id, row.nextCheckAt as Date);
  return toMonitor(row);
}

export async function controlMonitor(
  ctx: Context,
  userId: string,
  id: string,
  action: "pause" | "resume" | "stop" | "check",
) {
  const current = await getMonitorRow(ctx, userId, id);
  if (current.status === "stopped" && action !== "stop")
    throw new AppError("This watch has stopped. Create a new one to watch again.", 409);
  if (action === "check" && current.status !== "active")
    throw new AppError("Resume the watch to check it", 409);
  const now = new Date();
  const patch =
    action === "pause"
      ? { status: "paused" as const, nextCheckAt: null }
      : action === "stop"
        ? { status: "stopped" as const, nextCheckAt: null }
        : action === "resume"
          ? { status: "active" as const, nextCheckAt: now, failures: 0, error: null }
          : { nextCheckAt: now };
  const [row] = await ctx.db
    .update(monitors)
    .set(patch)
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)))
    .returning();
  if (!row) throw notFound("Watch");
  await ctx.realtime.publish(userId, { type: "monitor", id });
  if (row.status === "active" && row.nextCheckAt)
    await ctx.monitors?.enqueue(userId, id, row.nextCheckAt);
  return toMonitor(row);
}

export async function deleteMonitor(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .delete(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)))
    .returning({ id: monitors.id });
  if (!row) throw notFound("Watch");
  await ctx.realtime.publish(userId, { type: "monitor", id });
}

export async function getDemoPage(ctx: Context, userId: string, slug: string) {
  const fallback = demoPageDefaults[slug];
  if (!fallback) throw notFound("Demo page");
  const [row] = await ctx.db
    .select()
    .from(demoPages)
    .where(and(eq(demoPages.userId, userId), eq(demoPages.slug, slug)));
  return { slug, url: `demo://${slug}`, title: fallback.title, text: row?.text ?? fallback.text };
}

export async function setDemoPage(ctx: Context, userId: string, slug: string, text: string) {
  if (!demoPageDefaults[slug]) throw notFound("Demo page");
  await ctx.db
    .insert(demoPages)
    .values({ userId, slug, text })
    .onConflictDoUpdate({ target: [demoPages.userId, demoPages.slug], set: { text } });
  return getDemoPage(ctx, userId, slug);
}

/** Monitors whose check is due. Used by the scheduler, which enqueues one check per slot. */
export async function dueMonitors(ctx: Context, now = new Date(), limit = 500) {
  return ctx.db
    .select({ id: monitors.id, userId: monitors.userId, nextCheckAt: monitors.nextCheckAt })
    .from(monitors)
    .where(and(eq(monitors.status, "active"), lte(monitors.nextCheckAt, now)))
    .orderBy(monitors.nextCheckAt)
    .limit(limit);
}

export type SourcePage = { url: string; title: string; text: string } | { error: string };

export async function readSource(ctx: Context, userId: string, url: string): Promise<SourcePage> {
  if (url.startsWith("demo://")) {
    if (!ctx.config.demoWorkspace) return { error: "Demo pages are turned off" };
    const page = await getDemoPage(ctx, userId, url.slice("demo://".length)).catch(() => null);
    return page ? { url, title: page.title, text: page.text } : { error: "Unknown demo page" };
  }
  const page = await readWebPage(ctx, url, maxText);
  return "error" in page ? page : { url: page.url, title: page.title, text: page.text };
}

const currencyOf: [RegExp, string][] = [
  [/^(US\$|USD)$/i, "USD"],
  [/^(C\$|CAD)$/i, "CAD"],
  [/^(A\$|AU\$|AUD)$/i, "AUD"],
  [/^\$$/, "USD"],
  [/^(€|EUR)$/i, "EUR"],
  [/^(£|GBP)$/i, "GBP"],
  [/^(₹|INR|Rs\.?)$/i, "INR"],
  [/^(¥|JPY)$/i, "JPY"],
];
const amount = String.raw`\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const marks = String.raw`US\$|C\$|AU?\$|\$|€|£|₹|¥|Rs\.?|USD|EUR|GBP|INR|JPY|CAD|AUD`;
const pricePattern = new RegExp(
  String.raw`(?:(${marks})\s?(${amount}))|(?:(${amount})\s?(€|£|USD|EUR|GBP|INR|JPY|CAD|AUD)\b)`,
  "gi",
);

/** Prices written with a currency mark ("$1,299.00", "€ 12,50", "499 EUR"). */
export function findPrices(text: string, currency: string | null) {
  const found: { amount: number; currency: string }[] = [];
  for (const m of text.matchAll(pricePattern)) {
    // Thresholds and discounts ("orders over $50", "save $20", "$5 off") are not prices.
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 12);
    if (/\b(over|above|save|saving|off|minimum|min\.?|up to|shipping)\s*$/i.test(before)) continue;
    if (/^\s*(off|shipping|or more)\b/i.test(after)) continue;
    const mark = m[1] ?? m[4] ?? "";
    const number = (m[2] ?? m[3] ?? "").replace(/\s/g, "");
    const code = currencyOf.find(([re]) => re.test(mark))?.[1];
    const parsed = parseAmount(number);
    if (!code || !parsed || parsed.cents <= 0) continue;
    if (currency && code !== currency) continue;
    found.push({ amount: parsed.cents / 100, currency: code });
  }
  return found;
}

const normalize = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxText);

function describeChange(before: string, after: string) {
  const old = new Set(before.split("\n"));
  const now = new Set(after.split("\n"));
  const added = [...now].filter((l) => !old.has(l)).slice(0, 3);
  const removed = [...old].filter((l) => !now.has(l)).slice(0, 3);
  return [
    added.length ? `Now: ${added.join(" · ")}` : "",
    removed.length ? `Before: ${removed.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1000);
}

const money = (value: number, currency: string | null) =>
  `${currency ?? ""}${currency ? " " : ""}${value.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Record one check. It applies only if the watch is still active and still due at `slot`, so a
 * check that finishes after the owner paused, resumed or re-checked the watch changes nothing.
 * Alerts are deduplicated per watch and state change.
 */
export async function recordCheck(
  ctx: Context,
  userId: string,
  id: string,
  slot: string,
  page: SourcePage,
) {
  const [m] = await ctx.db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
  if (m?.status !== "active" || m.nextCheckAt?.toISOString() !== slot) return null;
  const now = new Date();
  let outcome: MonitorOutcome;
  let detail: string;
  let patch: Partial<typeof monitors.$inferInsert>;
  let alert: { title: string; body: string; key: string } | null = null;

  if ("error" in page) {
    const failures = m.failures + 1;
    const paused = failures >= maxFailures;
    // Back off exponentially from the normal interval, up to a day.
    const delay = Math.min(m.intervalMinutes * 2 ** (failures - 1), 24 * 60) * 60_000;
    outcome = "error";
    detail = page.error;
    patch = {
      failures,
      error: page.error,
      lastCheckedAt: now,
      status: paused ? "paused" : "active",
      nextCheckAt: paused ? null : new Date(now.getTime() + delay),
    };
    if (paused)
      alert = {
        title: `Watch paused: ${m.title}`,
        body: `The page failed ${failures} checks in a row (${page.error}). Resume it when the page works again.`,
        key: `monitor-paused:${m.id}:${m.checks}`,
      };
  } else {
    const text = normalize(page.text);
    const hash = createHash("sha256").update(text).digest("hex");
    let matched = false;
    let lastPrice: string | null = m.lastPrice;
    if (m.condition === "change") {
      if (!m.lastHash) {
        outcome = "baseline";
        detail = "Saved the starting point. You'll hear when the page changes.";
      } else if (m.lastHash !== hash) {
        outcome = "changed";
        detail = describeChange(m.lastExcerpt, text) || "The page text changed.";
        alert = { title: `Changed: ${m.title}`, body: detail, key: `monitor:${m.id}:${hash}` };
      } else {
        outcome = "unchanged";
        detail = "No change.";
      }
    } else if (m.condition === "contains") {
      const needle = m.value.replace(/\s+/g, " ").toLowerCase();
      matched = text.replace(/\s+/g, " ").toLowerCase().includes(needle);
      const line = text.split("\n").find((l) => l.toLowerCase().includes(needle));
      outcome = matched ? "matched" : "waiting";
      detail = matched
        ? `Found “${m.value}”: ${line ?? ""}`.slice(0, 600)
        : `“${m.value}” is not on the page yet.`;
      if (matched && !m.matched)
        alert = {
          title: `Found: ${m.title}`,
          body: detail,
          key: `monitor:${m.id}:match:${m.checks}`,
        };
    } else {
      const prices = findPrices(text, m.currency);
      const threshold = Number(m.value);
      const lowest = prices.length ? Math.min(...prices.map((p) => p.amount)) : null;
      const lowestCurrency = prices.find((p) => p.amount === lowest)?.currency ?? m.currency;
      lastPrice = lowest === null ? null : String(lowest);
      matched = lowest !== null && lowest < threshold;
      outcome = matched ? "matched" : "waiting";
      detail =
        lowest === null
          ? `No ${m.currency ?? ""} price found on the page.`.replace("  ", " ")
          : matched
            ? `Price is ${money(lowest, lowestCurrency)}, below ${money(threshold, m.currency ?? lowestCurrency)}.`
            : `Lowest price is ${money(lowest, lowestCurrency)}; waiting for below ${money(threshold, m.currency ?? lowestCurrency)}.`;
      if (matched && !m.matched)
        alert = {
          title: `Price drop: ${m.title}`,
          body: detail,
          key: `monitor:${m.id}:price:${m.checks}`,
        };
    }
    patch = {
      lastHash: hash,
      lastExcerpt: text,
      lastPrice,
      matched,
      failures: 0,
      error: null,
      lastCheckedAt: now,
      nextCheckAt: new Date(now.getTime() + m.intervalMinutes * 60_000),
    };
  }

  const saved = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .update(monitors)
      .set({ ...patch, checks: sql`${monitors.checks} + 1` })
      .where(
        and(
          eq(monitors.id, id),
          eq(monitors.status, "active"),
          eq(monitors.nextCheckAt, new Date(slot)),
        ),
      )
      .returning();
    if (!row) return null;
    await tx.insert(monitorChecks).values({
      id: newId(),
      monitorId: id,
      userId,
      outcome,
      detail: detail.slice(0, 1000),
      price:
        "lastPrice" in patch && m.condition === "price_below" ? (patch.lastPrice ?? null) : null,
    });
    // Keep a bounded history per watch.
    const old = await tx
      .select({ id: monitorChecks.id })
      .from(monitorChecks)
      .where(eq(monitorChecks.monitorId, id))
      .orderBy(desc(monitorChecks.createdAt))
      .offset(keptChecks);
    if (old.length)
      await tx.delete(monitorChecks).where(
        inArray(
          monitorChecks.id,
          old.map((o) => o.id),
        ),
      );
    return row;
  });
  if (!saved) return null;
  await ctx.realtime.publish(userId, { type: "monitor", id });
  if (alert)
    await notify(ctx, userId, {
      title: alert.title,
      body: alert.body,
      link: `/watches/${id}`,
      dedupeKey: alert.key,
    });
  return { monitor: toMonitor(saved), outcome, detail };
}
