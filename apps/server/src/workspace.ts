import type { Notification, NotificationCategory, Settings, SettingsInput } from "@agent-v/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { type Context, iso, newId } from "./context.ts";
import { notifications, settings } from "./db/schema.ts";
import { AppError } from "./errors.ts";

export async function getSettings(ctx: Context, userId: string): Promise<Settings> {
  const [row] = await ctx.db.select().from(settings).where(eq(settings.userId, userId));
  const model = row?.model && ctx.models.isAllowed(row.model) ? row.model : ctx.models.defaultModel;
  return {
    model,
    agentName: row?.agentName ?? "Agent V",
    tone: row?.tone ?? "warm and concise",
    learnMemories: row?.learnMemories ?? true,
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

export { addMemory, listMemories, removeMemory } from "./memory/service.ts";

const toNotification = (row: typeof notifications.$inferSelect): Notification => ({
  id: row.id,
  title: row.title,
  body: row.body,
  taskId: row.taskId,
  link: row.link,
  category: row.category,
  readAt: iso(row.readAt),
  createdAt: row.createdAt.toISOString(),
});

/** Create a notification once per dedupe key and push it to the user's devices. */
export async function notify(
  ctx: Context,
  userId: string,
  input: {
    title: string;
    body: string;
    taskId?: string;
    link?: string;
    dedupeKey?: string;
    category?: NotificationCategory;
  },
) {
  const [row] = await ctx.db
    .insert(notifications)
    .values({
      id: newId(),
      userId,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 2000),
      taskId: input.taskId,
      link: input.link,
      category: input.category ?? "results",
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return;
  await ctx.realtime.publish(userId, { type: "notification", id: row.id });
  // Each notification is pushed to the owner's devices once, in the background.
  await ctx.push?.deliver(userId, row.id);
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
