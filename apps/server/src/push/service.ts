import {
  defaultNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferences,
  notificationPreferencesSchema,
  type PushDevice,
  pushDeviceSchema,
} from "@agent-v/shared";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { and, desc, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { type Context, iso, newId } from "../context.ts";
import { notifications, pushDevices, settings } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";
import { guardedFetch } from "../net/safe-fetch.ts";
import { enqueue } from "../queue.ts";

const maxDevices = 20;
export const pushQueue = "push";

const toDevice = (row: typeof pushDevices.$inferSelect): PushDevice => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: iso(row.lastUsedAt),
});

export async function getPreferences(
  ctx: Context,
  userId: string,
): Promise<NotificationPreferences> {
  const [row] = await ctx.db
    .select({ prefs: settings.pushPreferences })
    .from(settings)
    .where(eq(settings.userId, userId));
  return { ...defaultNotificationPreferences, ...row?.prefs };
}

export async function updatePreferences(ctx: Context, userId: string, raw: unknown) {
  const input = notificationPreferencesSchema.parse(raw);
  const next = { ...(await getPreferences(ctx, userId)), ...input };
  await ctx.db
    .insert(settings)
    .values({ userId, pushPreferences: next })
    .onConflictDoUpdate({ target: settings.userId, set: { pushPreferences: next } });
  await ctx.realtime.publish(userId, { type: "settings", id: userId });
  return next;
}

export async function listDevices(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(pushDevices)
    .where(eq(pushDevices.userId, userId))
    .orderBy(desc(pushDevices.createdAt));
  return rows.map(toDevice);
}

export function pushStatus(ctx: Context) {
  return { webPushKey: ctx.config.push.webPush?.publicKey ?? null };
}

/** Register a phone or browser. A device that was signed in to another account moves here. */
export async function registerDevice(ctx: Context, userId: string, raw: unknown) {
  const input = pushDeviceSchema.parse(raw);
  if (input.kind === "webpush") {
    if (!ctx.config.push.webPush)
      throw new AppError("Web Push is not configured on this server", 503);
    const endpoint = new URL(input.endpoint);
    if (endpoint.protocol !== "https:" && !ctx.config.allowPrivateNetworkFetch)
      throw new AppError("Push endpoints must use https", 422);
  }
  const address = input.kind === "expo" ? input.token : input.endpoint;
  const count = await ctx.db.$count(pushDevices, eq(pushDevices.userId, userId));
  const [existing] = await ctx.db
    .select()
    .from(pushDevices)
    .where(eq(pushDevices.address, address));
  if (!existing && count >= maxDevices)
    throw new AppError(`Remove a device first (at most ${maxDevices})`, 429);
  const [row] = await ctx.db
    .insert(pushDevices)
    .values({
      id: newId(),
      userId,
      kind: input.kind,
      address,
      keys: input.kind === "webpush" ? input.keys : null,
      label: input.label,
    })
    .onConflictDoUpdate({
      target: pushDevices.address,
      set: { userId, label: input.label, keys: input.kind === "webpush" ? input.keys : null },
    })
    .returning();
  if (!row) throw new AppError("The device could not be saved", 500);
  if (existing && existing.userId !== userId)
    await ctx.realtime.publish(existing.userId, { type: "device", id: existing.id });
  await ctx.realtime.publish(userId, { type: "device", id: row.id });
  return toDevice(row);
}

export async function removeDevice(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .delete(pushDevices)
    .where(and(eq(pushDevices.id, id), eq(pushDevices.userId, userId)))
    .returning({ id: pushDevices.id });
  if (!row) throw notFound("Device");
  await ctx.realtime.publish(userId, { type: "device", id });
}

interface Message {
  title: string;
  body: string;
  link: string;
  notificationId: string | null;
}
type Outcome = "sent" | "gone" | "retry" | "failed";

async function sendExpo(ctx: Context, tokens: string[], message: Message): Promise<Outcome[]> {
  const response = await fetch(`${ctx.config.push.expo.url}/send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(ctx.config.push.expo.accessToken
        ? { authorization: `Bearer ${ctx.config.push.expo.accessToken}` }
        : {}),
    },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title: message.title,
        body: message.body.slice(0, 500),
        sound: "default",
        data: { link: message.link, notificationId: message.notificationId },
      })),
    ),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status >= 500 || response.status === 429) return tokens.map(() => "retry");
  if (!response.ok) return tokens.map(() => "failed");
  const { data } = (await response.json()) as {
    data?: { status: "ok" | "error"; details?: { error?: string } }[];
  };
  return tokens.map((_, i) => {
    const ticket = data?.[i];
    if (ticket?.status === "ok") return "sent";
    return ticket?.details?.error === "DeviceNotRegistered" ? "gone" : "failed";
  });
}

async function sendWebPush(
  ctx: Context,
  device: typeof pushDevices.$inferSelect,
  message: Message,
): Promise<Outcome> {
  const vapid = ctx.config.push.webPush;
  if (!vapid || !device.keys) return "failed";
  const request = webpush.generateRequestDetails(
    { endpoint: device.address, keys: device.keys },
    JSON.stringify(message),
    {
      vapidDetails: {
        subject: vapid.subject,
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
      },
      TTL: 24 * 60 * 60,
      urgency: "normal",
    },
  );
  // Endpoints come from browsers but are stored by users: send through the network guard.
  const guard = guardedFetch({
    allowPrivate: ctx.config.allowPrivateNetworkFetch,
    timeoutMs: 15_000,
  });
  try {
    const response = await guard.fetch(request.endpoint, {
      method: "POST",
      headers: request.headers as Record<string, string>,
      body: request.body ? new Uint8Array(request.body) : null,
    });
    await response.body?.cancel();
    if (response.status === 404 || response.status === 410) return "gone";
    if (response.status === 429 || response.status >= 500) return "retry";
    return response.ok ? "sent" : "failed";
  } catch {
    return "retry";
  } finally {
    await guard.close();
  }
}

/** Send to every device of the owner. Dead devices are removed; transient failures repeat. */
export async function sendToDevices(
  ctx: Context,
  userId: string,
  message: Message,
  only?: string[],
) {
  const devices = await ctx.db
    .select()
    .from(pushDevices)
    .where(and(eq(pushDevices.userId, userId), only ? inArray(pushDevices.id, only) : undefined));
  const results = new Map<string, Outcome>();
  const expo = devices.filter((d) => d.kind === "expo");
  if (expo.length) {
    const outcomes = await sendExpo(
      ctx,
      expo.map((d) => d.address),
      message,
    ).catch((): Outcome[] => expo.map(() => "retry"));
    for (const [i, d] of expo.entries()) results.set(d.id, outcomes[i] ?? "failed");
  }
  for (const device of devices.filter((d) => d.kind === "webpush"))
    results.set(device.id, await sendWebPush(ctx, device, message));
  const gone = [...results].filter(([, o]) => o === "gone").map(([id]) => id);
  const sent = [...results].filter(([, o]) => o === "sent").map(([id]) => id);
  if (gone.length) await ctx.db.delete(pushDevices).where(inArray(pushDevices.id, gone));
  if (sent.length)
    await ctx.db
      .update(pushDevices)
      .set({ lastUsedAt: new Date() })
      .where(inArray(pushDevices.id, sent));
  if (gone.length) await ctx.realtime.publish(userId, { type: "device", id: "all" });
  return {
    sent: sent.length,
    removed: gone.length,
    retry: [...results].filter(([, o]) => o === "retry").map(([id]) => id),
  };
}

export async function sendTest(ctx: Context, userId: string) {
  const result = await sendToDevices(ctx, userId, {
    title: "Agent V",
    body: "Notifications are working on this device.",
    link: "/tasks",
    notificationId: null,
  });
  if (!result.sent && !result.retry.length) throw new AppError("No device received it", 409);
  return result;
}

let context: Context | undefined;
export function setPushContext(ctx: Context) {
  context = ctx;
}

/** Deliver one stored notification, if its category is on. Retries only the devices that failed. */
async function deliverFunction(userId: string, notificationId: string): Promise<void> {
  const c = context;
  if (!c) throw new Error("Push context is not configured");
  const message = await DBOS.runStep(
    async () => {
      const [row] = await c.db
        .select()
        .from(notifications)
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
      if (!row || row.readAt) return null;
      const prefs = await getPreferences(c, userId);
      if (!prefs[row.category as NotificationCategory]) return null;
      return {
        title: row.title,
        body: row.body,
        link: row.link ?? (row.taskId ? `/tasks/${row.taskId}` : "/tasks"),
        notificationId: row.id,
      };
    },
    { name: "load" },
  );
  if (!message) return;
  let pending: string[] | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await DBOS.runStep(() => sendToDevices(c, userId, message, pending), {
      name: `send:${attempt}`,
    });
    if (!result.retry.length) return;
    pending = result.retry;
    await DBOS.sleep(2 ** attempt * 5_000);
  }
}
export const deliverWorkflow = DBOS.registerWorkflow(deliverFunction, {
  name: "push-notification",
});

export async function enqueueDelivery(ctx: Context, userId: string, notificationId: string) {
  const [device] = await ctx.db
    .select({ id: pushDevices.id })
    .from(pushDevices)
    .where(eq(pushDevices.userId, userId))
    .limit(1);
  if (!device) return;
  await enqueue(
    { queue: pushQueue, workflow: "push-notification", id: `push:${notificationId}`, user: userId },
    userId,
    notificationId,
  );
}
