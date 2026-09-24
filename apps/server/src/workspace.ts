import type { Memory, Notification, Settings, SettingsInput } from "@agent-v/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { type Context, iso, newId } from "./context.ts";
import { memories, notifications, settings } from "./db/schema.ts";
import { AppError, notFound } from "./errors.ts";

export async function getSettings(ctx: Context, userId: string): Promise<Settings> {
  const [row] = await ctx.db.select().from(settings).where(eq(settings.userId, userId));
  const model = row?.model && ctx.models.isAllowed(row.model) ? row.model : ctx.models.defaultModel;
  return {
    model,
    agentName: row?.agentName ?? "Agent V",
    tone: row?.tone ?? "warm and concise",
  };
}

export async function updateSettings(ctx: Context, userId: string, input: SettingsInput) {
  if (input.model && !ctx.models.isAllowed(input.model))
    throw new AppError(`Model "${input.model}" is not enabled`, 422);
  await ctx.db
    .insert(settings)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: settings.userId, set: input });
  await ctx.realtime.publish(userId, { type: "settings", id: userId });
  return getSettings(ctx, userId);
}

const toMemory = (row: typeof memories.$inferSelect): Memory => ({
  id: row.id,
  text: row.text,
  source: row.source,
  createdAt: row.createdAt.toISOString(),
});

export async function listMemories(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt))
    .limit(200);
  return rows.map(toMemory);
}

export async function addMemory(ctx: Context, userId: string, text: string, source: string) {
  const [row] = await ctx.db
    .insert(memories)
    .values({ id: newId(), userId, text, source })
    .returning();
  if (!row) throw new AppError("Memory could not be saved", 500);
  await ctx.realtime.publish(userId, { type: "memory", id: row.id });
  return toMemory(row);
}

export async function removeMemory(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)))
    .returning({ id: memories.id });
  if (!row) throw notFound("Memory");
  await ctx.realtime.publish(userId, { type: "memory", id });
}

const toNotification = (row: typeof notifications.$inferSelect): Notification => ({
  id: row.id,
  title: row.title,
  body: row.body,
  taskId: row.taskId,
  readAt: iso(row.readAt),
  createdAt: row.createdAt.toISOString(),
});

/** Create a notification once per dedupe key and push it to the user's devices. */
export async function notify(
  ctx: Context,
  userId: string,
  input: { title: string; body: string; taskId?: string; dedupeKey?: string },
) {
  const [row] = await ctx.db
    .insert(notifications)
    .values({
      id: newId(),
      userId,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 2000),
      taskId: input.taskId,
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing()
    .returning();
  if (row) await ctx.realtime.publish(userId, { type: "notification", id: row.id });
}

export async function listNotifications(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  return rows.map(toNotification);
}

export async function markNotificationsRead(ctx: Context, userId: string, id?: string) {
  await ctx.db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        id ? eq(notifications.id, id) : undefined,
      ),
    );
  await ctx.realtime.publish(userId, { type: "notification", id: id ?? "all" });
}
