import { createHash } from "node:crypto";
import type { Action } from "@agent-v/shared";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { type Context, newId } from "./context.ts";
import { actions } from "./db/schema.ts";
import { AppError, notFound } from "./errors.ts";
import { safeFetch } from "./net/safe-fetch.ts";

/**
 * External writes. Each kind validates its payload, describes itself for review, and executes
 * only after the owner approves the exact payload hash.
 */
interface Executor<T> {
  schema: z.ZodType<T>;
  title(payload: T): string;
  run(ctx: Context, payload: T): Promise<string>;
}

const webhookPayload = z.object({
  url: z.url().max(4096),
  body: z.record(z.string(), z.unknown()),
  summary: z.string().max(500).optional(),
});

export const executors = {
  "webhook.post": {
    schema: webhookPayload,
    title: (p) => `POST to ${new URL(p.url).host}`,
    async run(ctx, p) {
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
  const executor = executors[input.kind];
  const payload = executor.schema.parse(input.payload);
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
  const executor = executors[claimed.kind as ActionKind];
  let patch: Partial<typeof actions.$inferInsert>;
  try {
    if (!executor) throw new Error(`Unknown action kind ${claimed.kind}`);
    const result = await executor.run(ctx, executor.schema.parse(claimed.payload));
    patch = { status: "succeeded", result };
  } catch (error) {
    patch = { status: "failed", error: (error as Error).message };
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
