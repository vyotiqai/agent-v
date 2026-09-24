import type { BrowserSession } from "@agent-v/shared";
import { and, desc, eq } from "drizzle-orm";
import { type Context, newId } from "../context.ts";
import { browserSessions } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";
import { storeFile } from "../files/service.ts";
import type { BrowserClient } from "./client.ts";

const maxSessionsPerUser = 20;
type Row = typeof browserSessions.$inferSelect;

export function browserOf(ctx: Context): BrowserClient {
  if (!ctx.browser) throw new AppError("The cloud browser is not configured on this server", 503);
  return ctx.browser;
}

export function toBrowserSession(ctx: Context, row: Row): BrowserSession {
  const path = `/api/browsers/${row.id}/screenshot`;
  return {
    id: row.id,
    threadId: row.threadId,
    taskId: row.taskId,
    url: row.url,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    screenshotUrl: `${ctx.config.publicUrl}${path}?${ctx.signer.sign(row.userId, path, 15 * 60)}&v=${row.updatedAt.getTime()}`,
  };
}

export async function listBrowserSessions(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(browserSessions)
    .where(eq(browserSessions.userId, userId))
    .orderBy(desc(browserSessions.updatedAt))
    .limit(maxSessionsPerUser);
  return rows.map((row) => toBrowserSession(ctx, row));
}

export async function getBrowserRow(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(browserSessions)
    .where(and(eq(browserSessions.id, id), eq(browserSessions.userId, userId)));
  if (!row) throw notFound("Browser session");
  return row;
}

export type BrowserScope = { threadId?: string; taskId?: string };

/** The browser for a chat or task (one each), or a new standalone one. */
async function sessionFor(ctx: Context, userId: string, scope: BrowserScope) {
  const key = scope.taskId
    ? eq(browserSessions.taskId, scope.taskId)
    : scope.threadId
      ? eq(browserSessions.threadId, scope.threadId)
      : null;
  if (key) {
    const [existing] = await ctx.db
      .select()
      .from(browserSessions)
      .where(and(eq(browserSessions.userId, userId), key));
    if (existing) return existing;
  }
  const rows = await ctx.db
    .select({ id: browserSessions.id })
    .from(browserSessions)
    .where(eq(browserSessions.userId, userId))
    .orderBy(desc(browserSessions.updatedAt));
  // Keep the newest sessions; older ones (and their profiles) are recycled.
  for (const old of rows.slice(maxSessionsPerUser - 1))
    await deleteBrowserSession(ctx, userId, old.id);
  const [row] = await ctx.db
    .insert(browserSessions)
    .values({ id: newId(), userId, threadId: scope.threadId, taskId: scope.taskId })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  return sessionFor(ctx, userId, scope);
}

async function record(
  ctx: Context,
  userId: string,
  id: string,
  state: { url: string; title: string },
) {
  const [row] = await ctx.db
    .update(browserSessions)
    .set({ url: state.url.slice(0, 8192), title: state.title.slice(0, 500) })
    .where(and(eq(browserSessions.id, id), eq(browserSessions.userId, userId)))
    .returning();
  await ctx.realtime.publish(userId, { type: "browser", id });
  if (!row) throw notFound("Browser session");
  return row;
}

export async function openBrowser(ctx: Context, userId: string, scope: BrowserScope, url: string) {
  const client = browserOf(ctx);
  const session = await sessionFor(ctx, userId, scope);
  const state = await client.open(session.id, url);
  return toBrowserSession(ctx, await record(ctx, userId, session.id, state));
}

export async function navigateBrowser(ctx: Context, userId: string, id: string, url: string) {
  const row = await getBrowserRow(ctx, userId, id);
  const state = await browserOf(ctx).open(row.id, url);
  return toBrowserSession(ctx, await record(ctx, userId, row.id, state));
}

export async function deleteBrowserSession(ctx: Context, userId: string, id: string) {
  const row = await getBrowserRow(ctx, userId, id);
  await ctx.browser?.remove(row.id).catch(() => {});
  await ctx.db.delete(browserSessions).where(eq(browserSessions.id, row.id));
  await ctx.realtime.publish(userId, { type: "browser", id });
}

/** Agent tool: open a page in the scope's browser and return its text. */
export async function browseForAgent(
  ctx: Context,
  userId: string,
  scope: BrowserScope,
  url: string,
  maxChars = 20_000,
) {
  try {
    const session = await openBrowser(ctx, userId, scope, url);
    return await readForAgent(ctx, userId, session.id, maxChars);
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function readForAgent(ctx: Context, userId: string, id: string, maxChars = 20_000) {
  const row = await getBrowserRow(ctx, userId, id);
  const page = await browserOf(ctx).read(row.id);
  await record(ctx, userId, row.id, page);
  return {
    sessionId: row.id,
    url: page.url,
    title: page.title,
    text: page.text.slice(0, maxChars),
    truncated: page.truncated || page.text.length > maxChars,
  };
}

/** Agent tool helpers that act on the scope's existing browser. */
export async function scopedAgentAction(
  ctx: Context,
  userId: string,
  scope: BrowserScope,
  action: { type: "read" } | { type: "click"; name: string },
) {
  try {
    const session = await sessionFor(ctx, userId, scope);
    if (!session.url) return { error: "Open a page with browse first" };
    if (action.type === "click") {
      const state = await browserOf(ctx).clickLink(session.id, action.name);
      await record(ctx, userId, session.id, state);
    }
    return await readForAgent(ctx, userId, session.id);
  } catch (error) {
    return { error: (error as Error).message };
  }
}

/** Move a browser's captured PDF downloads into the owner's Files. */
export async function importDownloads(ctx: Context, userId: string, id: string) {
  const row = await getBrowserRow(ctx, userId, id);
  const client = browserOf(ctx);
  const saved = [];
  for (const download of await client.downloads(row.id)) {
    const bytes = await client.downloadBytes(row.id, download.id);
    saved.push(
      await storeFile(ctx, userId, {
        name: download.name,
        bytes,
        source: `Downloaded from ${row.title || row.url}`,
      }),
    );
    await client.removeDownload(row.id, download.id);
  }
  return saved;
}
