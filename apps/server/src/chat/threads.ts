import type { ChatMessage, Thread, UpdateThreadInput } from "@agent-v/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { type Context, newId } from "../context.ts";
import { messages, threads } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";

const toThread = (row: typeof threads.$inferSelect): Thread => ({
  id: row.id,
  title: row.title,
  archived: row.archived,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function listThreads(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(threads)
    .where(eq(threads.userId, userId))
    .orderBy(desc(threads.updatedAt))
    .limit(200);
  return rows.map(toThread);
}

export async function createThread(ctx: Context, userId: string, title = "New chat") {
  const [row] = await ctx.db.insert(threads).values({ id: newId(), userId, title }).returning();
  if (!row) throw new AppError("Chat could not be created", 500);
  await ctx.realtime.publish(userId, { type: "thread", id: row.id });
  return toThread(row);
}

export async function getThread(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.userId, userId)));
  if (!row) throw notFound("Chat");
  return toThread(row);
}

export async function updateThread(
  ctx: Context,
  userId: string,
  id: string,
  input: UpdateThreadInput & { touch?: boolean },
) {
  const { touch, ...patch } = input;
  const [row] = await ctx.db
    .update(threads)
    .set(touch ? { ...patch, updatedAt: new Date() } : patch)
    .where(and(eq(threads.id, id), eq(threads.userId, userId)))
    .returning();
  if (!row) throw notFound("Chat");
  await ctx.realtime.publish(userId, { type: "thread", id });
  return toThread(row);
}

export async function listMessages(ctx: Context, userId: string, threadId: string) {
  await getThread(ctx, userId, threadId);
  const rows = await ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.userId, userId)))
    .orderBy(asc(messages.seq));
  return rows.map((row): ChatMessage => {
    if (row.role === "user") return { id: row.id, role: "user", content: row.content ?? "" };
    if (row.role === "tool")
      return {
        id: row.id,
        role: "tool",
        content: row.content ?? "",
        toolCallId: row.toolCallId ?? "",
        ...(row.error ? { error: row.error } : {}),
      };
    return {
      id: row.id,
      role: "assistant",
      ...(row.content ? { content: row.content } : {}),
      ...(row.toolCalls?.length ? { toolCalls: row.toolCalls } : {}),
    };
  });
}

export async function appendMessages(
  ctx: Context,
  userId: string,
  threadId: string,
  list: ChatMessage[],
) {
  if (!list.length) return;
  await ctx.db
    .insert(messages)
    .values(
      list.map((m) => ({
        id: m.id,
        threadId,
        userId,
        role: m.role,
        content: m.content ?? null,
        toolCalls: m.role === "assistant" ? (m.toolCalls ?? null) : null,
        toolCallId: m.role === "tool" ? m.toolCallId : null,
        error: m.role === "tool" ? (m.error ?? null) : null,
      })),
    )
    .onConflictDoNothing();
}
