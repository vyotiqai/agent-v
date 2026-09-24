import { createHash } from "node:crypto";
import type { CalendarEvent, Evidence, Idea, MailSummary } from "@agent-v/shared";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { Context } from "../context.ts";
import { financeReports, goals, ideas, monitors, settings } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";
import { workspaceFor } from "../providers/index.ts";
import type { WorkspaceProvider } from "../providers/types.ts";
import { createTask } from "../tasks/service.ts";

const staleAfterMs = 15 * 60_000;
const recentMailDays = 21;

type Candidate = Omit<Idea, "id" | "status" | "taskId" | "createdAt"> & { key: string };
type Kind = Idea["kind"];

/** A UUID-shaped id derived from a seed, so the same source always maps to the same row. */
export function stableId(seed: string) {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const toIdea = (row: typeof ideas.$inferSelect): Idea => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  reason: row.reason,
  prompt: row.prompt,
  evidence: row.evidence,
  status: row.status,
  goalId: row.goalId,
  taskId: row.taskId,
  createdAt: row.createdAt.toISOString(),
});

const senderName = (from: string) =>
  from
    .replace(/\s*<.*>/, "")
    .replace(/"/g, "")
    .trim() || from;
/** Shorten text at a word boundary. */
function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trimEnd()}…`;
}
const mailEvidence = (m: MailSummary): Evidence => ({
  kind: "mail",
  // Mail evidence opens the whole thread.
  id: m.threadId,
  title: m.subject || "(no subject)",
  excerpt: clip(`${senderName(m.from)}: ${m.snippet}`, 200),
  date: m.date,
});
/** The app formats `date` in the viewer's time zone; the excerpt carries the rest. */
const eventEvidence = (e: CalendarEvent): Evidence => ({
  kind: "event",
  id: e.id,
  title: e.title,
  excerpt: [e.allDay ? "All day" : "", e.location].filter(Boolean).join(" · "),
  date: e.allDay ? null : e.start,
});

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** The next date for a weekday mentioned in text ("dinner on Saturday"), if any. */
function mentionedDay(text: string, now: Date) {
  const lower = text.toLowerCase();
  const index = weekdays.findIndex((d) => lower.includes(d));
  if (index < 0) return null;
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + ((index - date.getUTCDay() + 7) % 7 || 7));
  return date.toISOString().slice(0, 10);
}

async function mailIdeas(provider: WorkspaceProvider, now: Date): Promise<Candidate[]> {
  const cutoff = now.getTime() - recentMailDays * 86_400_000;
  const inbox = (await provider.searchMail("in:inbox", 30)).filter(
    (m) => !m.labels.includes("SENT") && Date.parse(m.date) >= cutoff,
  );
  const account = provider.account.toLowerCase();
  const answered = async (m: MailSummary) => {
    // A reply from the owner (sent after this message) means it is handled.
    const thread = await provider.getThread(m.threadId).catch(() => []);
    return thread.some(
      (t) =>
        (t.labels.includes("SENT") || t.from.toLowerCase().includes(account)) &&
        Date.parse(t.date) >= Date.parse(m.date),
    );
  };
  const found: Candidate[] = [];
  const forms = inbox.filter(
    (m) =>
      m.attachments.some((a) => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.name)) &&
      /\b(form|permission|slip|sign|signature|application|waiver|consent|fill)/i.test(
        `${m.subject} ${m.snippet}`,
      ),
  );
  for (const m of forms.slice(0, 5)) {
    if (await answered(m)) continue;
    const pdf = m.attachments.find((a) => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.name));
    found.push({
      key: `paperwork:${m.id}`,
      kind: "paperwork",
      title: `Fill in “${pdf?.name ?? "the form"}”`,
      reason: `${senderName(m.from)} sent a form to complete. I can fill it with your details and prepare the reply for you to review.`,
      prompt: `Complete the form “${pdf?.name ?? "attachment"}” from the email “${m.subject}” and prepare a reply with the filled copy for my review.`,
      evidence: [mailEvidence(m)],
      goalId: null,
    });
  }
  const asks = inbox.filter(
    (m) =>
      !forms.includes(m) &&
      /\?/.test(`${m.subject} ${m.snippet}`) &&
      /\b(free|available|are you|can you|could you|would you|let me know|rsvp|join|up for)\b/i.test(
        `${m.subject} ${m.snippet}`,
      ),
  );
  for (const m of asks.slice(0, 5)) {
    if (await answered(m)) continue;
    const name = senderName(m.from).split(" ")[0] ?? senderName(m.from);
    const evidence = [mailEvidence(m)];
    const day = mentionedDay(`${m.subject} ${m.snippet}`, now);
    let calendarNote = "";
    if (day) {
      const events = await provider
        .listEvents({ from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z` })
        .catch(() => null);
      if (events?.length) {
        evidence.push(...events.slice(0, 3).map(eventEvidence));
        calendarNote = ` You have ${events.length} thing${events.length === 1 ? "" : "s"} on your calendar that day.`;
      } else if (events) calendarNote = " Your calendar is free that day.";
    }
    found.push({
      key: `reply:${m.id}`,
      kind: "reply",
      title: `Reply to ${name}`,
      reason: `${senderName(m.from)} asked you something and hasn't heard back.${calendarNote}`,
      prompt: `Reply to ${name} about “${m.subject}”. Check my calendar, ask me what to say, and prepare the reply for my review.`,
      evidence,
      goalId: null,
    });
  }
  return found;
}

/** Recompute suggestions. Ideas whose source is gone (answered, planned) retire themselves. */
export async function refreshIdeas(ctx: Context, userId: string, now = new Date()) {
  const candidates: Candidate[] = [];
  const scanned = new Set<Kind>();

  const provider = await workspaceFor(ctx, userId).catch(() => null);
  if (provider) {
    try {
      candidates.push(...(await mailIdeas(provider, now)));
      scanned.add("paperwork").add("reply");
    } catch (error) {
      console.warn("[ideas] mail scan failed:", (error as Error).message);
    }
  }

  const goalRows = await ctx.db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, "active")))
    .limit(100);
  scanned.add("plan");
  for (const g of goalRows)
    if (!g.milestones.length)
      candidates.push({
        key: `plan:${g.id}`,
        kind: "plan",
        title: `Plan “${g.title}”`,
        reason: "This goal has no milestones yet. A short plan gives it a clear next step.",
        prompt: `Make a plan for my goal "${g.title}": break it into 3-6 concrete milestones and save them with add_goal_milestones.${g.description ? ` Context: ${g.description}` : ""}`,
        evidence: [
          {
            kind: "goal",
            id: g.id,
            title: g.title,
            excerpt: g.description,
            date: g.createdAt.toISOString(),
          },
        ],
        goalId: g.id,
      });

  const [report] = await ctx.db
    .select({
      id: financeReports.id,
      name: financeReports.name,
      currency: financeReports.currency,
      summary: financeReports.summary,
      createdAt: financeReports.createdAt,
    })
    .from(financeReports)
    .where(eq(financeReports.userId, userId))
    .orderBy(desc(financeReports.createdAt))
    .limit(1);
  scanned.add("finance");
  const recurring = report?.summary.recurring ?? [];
  if (report && recurring.length >= 3) {
    const total = recurring.reduce((s, r) => s + r.amount, 0);
    const money = `${report.currency ? `${report.currency} ` : ""}${total.toFixed(2)}`;
    candidates.push({
      key: `finance:${report.id}`,
      kind: "finance",
      title: `Review ${recurring.length} recurring charges`,
      reason: `“${report.name}” shows ${recurring.length} charges repeating every month, about ${money} a month in total.`,
      prompt:
        "Review my recurring charges from my newest imported transactions (use finance_summary) and suggest which ones I could cancel or reduce, with the monthly savings.",
      evidence: recurring.slice(0, 5).map((r) => ({
        kind: "finance" as const,
        id: report.id,
        title: r.merchant,
        excerpt: `${r.amount.toFixed(2)} a month for ${r.months} months · ${r.category}`,
        date: null,
      })),
      goalId: null,
    });
  }

  const [watchRows] = await Promise.all([
    ctx.db
      .select({ id: monitors.id, title: monitors.title, error: monitors.error, url: monitors.url })
      .from(monitors)
      .where(and(eq(monitors.userId, userId), eq(monitors.status, "paused")))
      .limit(20),
  ]);
  scanned.add("watch");
  for (const w of watchRows)
    if (w.error)
      candidates.push({
        key: `watch:${w.id}:${w.error}`,
        kind: "watch",
        title: `Fix the “${w.title}” watch`,
        reason: `It paused after repeated failures: ${w.error}`,
        prompt: `My page watch “${w.title}” for ${w.url} keeps failing with “${w.error}”. Check the page and tell me what changed and how to fix the watch.`,
        evidence: [{ kind: "monitor", id: w.id, title: w.title, excerpt: w.error, date: null }],
        goalId: null,
      });

  const rows = candidates.map((c) => ({
    id: stableId(`${userId}:${c.key}`),
    userId,
    kind: c.kind,
    title: c.title.slice(0, 200),
    reason: c.reason.slice(0, 1000),
    prompt: c.prompt.slice(0, 12_000),
    evidence: c.evidence.slice(0, 6),
    goalId: c.goalId,
  }));
  if (rows.length) await ctx.db.insert(ideas).values(rows).onConflictDoNothing();
  // Retire open suggestions whose source no longer calls for them.
  const kinds = [...scanned];
  if (kinds.length)
    await ctx.db
      .update(ideas)
      .set({ status: "dismissed" })
      .where(
        and(
          eq(ideas.userId, userId),
          eq(ideas.status, "new"),
          inArray(ideas.kind, kinds),
          rows.length
            ? notInArray(
                ideas.id,
                rows.map((r) => r.id),
              )
            : undefined,
        ),
      );
  await ctx.db
    .insert(settings)
    .values({ userId, ideasRefreshedAt: now })
    .onConflictDoUpdate({ target: settings.userId, set: { ideasRefreshedAt: now } });
  await ctx.realtime.publish(userId, { type: "idea", id: "all" });
}

export async function listIdeas(ctx: Context, userId: string, options: { refresh?: boolean } = {}) {
  const [row] = await ctx.db
    .select({ at: settings.ideasRefreshedAt })
    .from(settings)
    .where(eq(settings.userId, userId));
  const stale = !row?.at || Date.now() - row.at.getTime() > staleAfterMs;
  if (options.refresh || stale) await refreshIdeas(ctx, userId);
  const rows = await ctx.db
    .select()
    .from(ideas)
    .where(and(eq(ideas.userId, userId), notInArray(ideas.status, ["dismissed"])))
    .orderBy(desc(ideas.createdAt))
    .limit(50);
  return rows.map(toIdea);
}

/**
 * Accept or dismiss a suggestion. Accepting starts one task (a repeated or concurrent accept
 * returns the same task); the prompt can be edited first.
 */
export async function decideIdea(
  ctx: Context,
  userId: string,
  id: string,
  action: "accept" | "dismiss",
  prompt?: string,
) {
  const [current] = await ctx.db
    .select()
    .from(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.userId, userId)));
  if (!current) throw notFound("Idea");
  if (action === "dismiss") {
    if (current.status === "accepted") throw new AppError("This idea is already underway", 409);
    const [row] = await ctx.db
      .update(ideas)
      .set({ status: "dismissed" })
      .where(and(eq(ideas.id, id), eq(ideas.status, "new")))
      .returning();
    await ctx.realtime.publish(userId, { type: "idea", id });
    return toIdea(row ?? current);
  }
  const [claimed] = await ctx.db
    .update(ideas)
    .set({ status: "accepted", ...(current.status === "new" && prompt && { prompt }) })
    .where(and(eq(ideas.id, id), inArray(ideas.status, ["new", "accepted"])))
    .returning();
  if (!claimed) throw new AppError("This idea was dismissed", 409);
  const task = await createTask(
    ctx,
    userId,
    {
      prompt: claimed.prompt,
      title: claimed.title,
      goalId: claimed.goalId ?? undefined,
    },
    { id: stableId(`idea-task:${id}`) },
  );
  const [row] = await ctx.db
    .update(ideas)
    .set({ taskId: task.id })
    .where(eq(ideas.id, id))
    .returning();
  await ctx.realtime.publish(userId, { type: "idea", id });
  return { idea: toIdea(row ?? claimed), task };
}
