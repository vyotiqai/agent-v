import { createHash } from "node:crypto";
import type { Action } from "@agent-v/shared";
import { emailDraftSchema, eventDeleteSchema, eventDraftSchema } from "@agent-v/shared";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { type Context, newId } from "./context.ts";
import { actions } from "./db/schema.ts";
import { AppError, notFound } from "./errors.ts";
import { getFileRow, readFileBytes } from "./files/service.ts";
import { safeFetch } from "./net/safe-fetch.ts";
import { workspaceFor } from "./providers/index.ts";

/**
 * External writes. Each kind validates its payload, describes itself for review, and executes
 * only after the owner approves the exact payload hash. Mail and calendar payloads record the
 * account they were reviewed for; if the connected account changes, they refuse to run.
 */
interface Executor<T> {
  schema: z.ZodType<T>;
  title(payload: T): string;
  /** Called when proposing: check references and pin the account. */
  prepare?(ctx: Context, userId: string, payload: T): Promise<T>;
  run(ctx: Context, userId: string, payload: T): Promise<string>;
}

const webhookPayload = z.object({
  url: z.url().max(4096),
  body: z.record(z.string(), z.unknown()),
  summary: z.string().max(500).optional(),
});
const account = { account: z.string().max(320).optional() };
const emailPayload = emailDraftSchema.extend(account);
const eventPayload = eventDraftSchema.and(z.object(account));
const deletePayload = eventDeleteSchema.extend(account);

async function pinAccount<T extends { account?: string }>(
  ctx: Context,
  userId: string,
  payload: T,
) {
  const provider = await workspaceFor(ctx, userId);
  if (!provider.canWrite)
    throw new AppError("Grant write access to Google in Settings before preparing this", 409);
  return { ...payload, account: provider.account };
}

async function providerFor(ctx: Context, userId: string, pinned: string | undefined) {
  const provider = await workspaceFor(ctx, userId);
  if (!pinned || provider.account !== pinned)
    throw new Error(
      `This was reviewed for ${pinned ?? "another account"}, but ${provider.account} is connected now. Prepare it again.`,
    );
  return provider;
}

export const executors = {
  "webhook.post": {
    schema: webhookPayload,
    title: (p) => `POST to ${new URL(p.url).host}`,
    async run(ctx, _userId, p) {
      const response = await safeFetch(p.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p.body),
        allowPrivate: ctx.config.allowPrivateNetworkFetch,
        maxBytes: 20_000,
        maxRedirects: 0,
      });
      if (response.status >= 400)
        throw new Error(`The webhook answered ${response.status}: ${response.body.slice(0, 200)}`);
      return `Delivered (${response.status})`;
    },
  } satisfies Executor<z.infer<typeof webhookPayload>>,
  "email.send": {
    schema: emailPayload,
    title: (p) => `Email “${p.subject}” to ${p.to.join(", ")}`,
    async prepare(ctx, userId, p) {
      for (const id of p.attachmentIds) await getFileRow(ctx, userId, id);
      return pinAccount(ctx, userId, p);
    },
    async run(ctx, userId, p) {
      const provider = await providerFor(ctx, userId, p.account);
      const attachments = [];
      for (const id of p.attachmentIds) {
        const { row, bytes } = await readFileBytes(ctx, userId, id);
        attachments.push({ name: row.name, mimeType: row.mimeType, bytes });
      }
      return provider.sendMail(p, attachments);
    },
  } satisfies Executor<z.infer<typeof emailPayload>>,
  "calendar.create": {
    schema: eventPayload,
    title: (p) => `Add “${p.title}” to the calendar`,
    prepare: (ctx, userId, p) => pinAccount(ctx, userId, p),
    async run(ctx, userId, p) {
      return (await providerFor(ctx, userId, p.account)).createEvent(p);
    },
  } satisfies Executor<z.infer<typeof eventPayload>>,
  "calendar.delete": {
    schema: deletePayload,
    title: (p) => `Delete “${p.title}” from the calendar`,
    prepare: (ctx, userId, p) => pinAccount(ctx, userId, p),
    async run(ctx, userId, p) {
      return (await providerFor(ctx, userId, p.account)).deleteEvent(
        p.calendarId,
        p.eventId,
        p.etag,
      );
    },
  } satisfies Executor<z.infer<typeof deletePayload>>,
} as const;
export type ActionKind = keyof typeof executors;

const reviewWindowMs = 24 * 60 * 60 * 1000;

export const toAction = (row: typeof actions.$inferSelect): Action => ({
  id: row.id,
  taskId: row.taskId,
  kind: row.kind,
  title: row.title,
  summary: row.summary,
  payload: row.payload,
  hash: row.hash,
  status: row.status,
  result: row.result,
  error: row.error,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

export function hashAction(kind: string, payload: unknown) {
  return createHash("sha256").update(JSON.stringify({ kind, payload })).digest("hex");
}

export async function proposeAction(
  ctx: Context,
  userId: string,
  input: { id?: string; taskId?: string; kind: ActionKind; payload: unknown; summary?: string },
) {
  const executor = executors[input.kind] as Executor<Record<string, unknown>>;
  const parsed = executor.schema.parse(input.payload);
  const payload = executor.prepare ? await executor.prepare(ctx, userId, parsed) : parsed;
  const [row] = await ctx.db
    .insert(actions)
    .values({
      id: input.id ?? newId(),
      userId,
      taskId: input.taskId,
      kind: input.kind,
      title: executor.title(payload),
      summary: input.summary ?? executor.title(payload),
      payload,
      hash: hashAction(input.kind, payload),
      expiresAt: new Date(Date.now() + reviewWindowMs),
    })
    .onConflictDoNothing()
    .returning();
  // Idempotent: a replayed workflow step finds the action it already created.
  const action = row ?? (await getActionRow(ctx, userId, input.id ?? ""));
  await ctx.realtime.publish(userId, { type: "action", id: action.id });
  return toAction(action);
}

async function getActionRow(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(actions)
    .where(and(eq(actions.id, id), eq(actions.userId, userId)));
  if (!row) throw notFound("Action");
  return row;
}

export async function getAction(ctx: Context, userId: string, id: string) {
  return toAction(await getActionRow(ctx, userId, id));
}

/**
 * Record the owner's decision. Approval must quote the hash of the payload they reviewed and
 * only moves the action to `approved`; the task workflow performs the execution.
 */
export async function decideAction(
  ctx: Context,
  userId: string,
  id: string,
  hash: string,
  decision: "approve" | "deny",
) {
  const current = await getActionRow(ctx, userId, id);
  if (current.hash !== hash)
    throw new AppError("This action changed since you reviewed it. Open it again.", 409);
  if (current.status !== "awaiting_review")
    throw new AppError(`This action is already ${current.status.replace("_", " ")}`, 409);
  const [row] = await ctx.db
    .update(actions)
    .set({ status: decision === "approve" ? "approved" : "denied" })
    .where(
      and(
        eq(actions.id, id),
        eq(actions.userId, userId),
        eq(actions.hash, hash),
        eq(actions.status, "awaiting_review"),
        gt(actions.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) {
    const latest = await getActionRow(ctx, userId, id);
    if (latest.status === "awaiting_review" && latest.expiresAt <= new Date())
      throw new AppError("This review expired", 409);
    throw new AppError(`This action is already ${latest.status.replace("_", " ")}`, 409);
  }
  await ctx.realtime.publish(userId, { type: "action", id });
  return toAction(row);
}

/**
 * Execute an approved action at most once. A crash after the claim leaves the action in
 * `executing`; the replayed step then reports `outcome_unknown` instead of sending twice.
 */
export async function executeAction(ctx: Context, userId: string, id: string): Promise<Action> {
  const [claimed] = await ctx.db
    .update(actions)
    .set({ status: "executing" })
    .where(and(eq(actions.id, id), eq(actions.userId, userId), eq(actions.status, "approved")))
    .returning();
  if (!claimed) {
    const current = await getActionRow(ctx, userId, id);
    if (current.status !== "executing") return toAction(current);
    const [unknown] = await ctx.db
      .update(actions)
      .set({
        status: "outcome_unknown",
        error: "Interrupted while executing. Check the destination before trying again.",
      })
      .where(and(eq(actions.id, id), eq(actions.status, "executing")))
      .returning();
    await ctx.realtime.publish(userId, { type: "action", id });
    return toAction(unknown ?? current);
  }
  const executor = executors[claimed.kind as ActionKind] as
    | Executor<Record<string, unknown>>
    | undefined;
  let patch: Partial<typeof actions.$inferInsert>;
  try {
    if (!executor) throw new Error(`Unknown action kind ${claimed.kind}`);
    const result = await executor.run(ctx, userId, executor.schema.parse(claimed.payload));
    patch = { status: "succeeded", result };
  } catch (error) {
    // A write that may have happened is never retried or reported as failed.
    const unknown = (error as { outcomeUnknown?: boolean }).outcomeUnknown === true;
    patch = { status: unknown ? "outcome_unknown" : "failed", error: (error as Error).message };
  }
  const [done] = await ctx.db.update(actions).set(patch).where(eq(actions.id, id)).returning();
  await ctx.realtime.publish(userId, { type: "action", id });
  return toAction(done ?? claimed);
}

export async function expireAction(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .update(actions)
    .set({ status: "expired" })
    .where(and(eq(actions.id, id), eq(actions.status, "awaiting_review")))
    .returning();
  if (row) await ctx.realtime.publish(userId, { type: "action", id });
  return row ? toAction(row) : getAction(ctx, userId, id);
}
