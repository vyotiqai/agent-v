import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { APIError } from "better-auth/api";
import { asc, eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { cancelSubscriptions, enqueueSeatSync } from "../billing/service.ts";
import { subscriptionOf, toSubscriptionInfo } from "../billing/usage.ts";
import { eraseComputer } from "../computer/service.ts";
import type { Context } from "../context.ts";
import {
  actions,
  browserSessions,
  computerCommands,
  connections,
  connectors,
  files,
  financeReports,
  goals,
  ideas,
  member,
  memories,
  messages,
  monitorChecks,
  monitors,
  notifications,
  organization,
  pushDevices,
  settings,
  taskEvents,
  tasks,
  threads,
  usageCounters,
  user,
} from "../db/schema.ts";

// Account deletion: everything the person has, everywhere it lives. Rows go with the user row
// (every table cascades from it); this handles what the database cannot reach.

/** Workflow ids captured before deletion, erased after it. */
const pendingErase = new Map<string, string[]>();

export async function prepareDeletion(ctx: Context, userId: string) {
  const [membership] = await ctx.db
    .select({ id: member.id, organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));
  if (membership?.role === "owner") {
    const others = await ctx.db.$count(
      member,
      eq(member.organizationId, membership.organizationId),
    );
    if (others > 1)
      throw new APIError("BAD_REQUEST", {
        message:
          "Make someone else the team owner (or remove the members) before deleting your account",
      });
    // The only member: the team goes too.
    if (ctx.config.stripe)
      await cancelSubscriptions(ctx, "organization", membership.organizationId);
    await ctx.db.delete(organization).where(eq(organization.id, membership.organizationId));
  } else if (membership) {
    await ctx.db.delete(member).where(eq(member.id, membership.id));
    await enqueueSeatSync(ctx, membership.organizationId).catch(() => {});
  }
  if (ctx.config.stripe) await cancelSubscriptions(ctx, "user", userId);

  // Stop running work before its rows disappear.
  const taskRows = await ctx.db
    .select({ id: tasks.id, workflowId: tasks.workflowId })
    .from(tasks)
    .where(eq(tasks.userId, userId));
  const owned = await DBOS.listWorkflows({ authenticatedUser: userId });
  const ids = new Set([...owned.map((w) => w.workflowID), ...taskRows.map((t) => t.workflowId)]);
  for (const w of owned)
    if (w.status === "PENDING" || w.status === "ENQUEUED")
      await DBOS.cancelWorkflow(w.workflowID).catch(() => {});
  for (const t of taskRows) await DBOS.cancelWorkflow(t.workflowId).catch(() => {});
  pendingErase.set(userId, [...ids]);

  if (ctx.browser) {
    const sessions = await ctx.db
      .select({ id: browserSessions.id })
      .from(browserSessions)
      .where(eq(browserSessions.userId, userId));
    for (const s of sessions) await ctx.browser.remove(s.id).catch(() => {});
  }
  if (ctx.config.computer) await eraseComputer(ctx, userId);
  await rm(join(ctx.config.dataDir, "files", userId), { recursive: true, force: true });
}

/** After the rows are gone: erase the durable workflow history (inputs, outputs, steps). */
export async function eraseAccount(userId: string) {
  const ids = new Set(pendingErase.get(userId) ?? []);
  pendingErase.delete(userId);
  for (const w of await DBOS.listWorkflows({ authenticatedUser: userId })) ids.add(w.workflowID);
  for (const id of ids)
    await DBOS.deleteWorkflow(id, true).catch((error) =>
      console.warn("[account] could not erase workflow", id, (error as Error).message),
    );
  console.info(`[account] deleted an account and ${ids.size} workflow records`);
}

// Export: one ZIP with everything readable (JSON) plus the files themselves. Secrets (tokens,
// push addresses, vectors) are left out.

const omit = <T extends Record<string, unknown>>(row: T, keys: string[]) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

async function collect(ctx: Context, userId: string) {
  const mine = (column: AnyPgColumn) => eq(column, userId);
  const [profile] = await ctx.db
    .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId));
  const threadRows = await ctx.db.select().from(threads).where(mine(threads.userId));
  const messageRows = await ctx.db
    .select()
    .from(messages)
    .where(mine(messages.userId))
    .orderBy(asc(messages.createdAt));
  const taskRows = await ctx.db.select().from(tasks).where(mine(tasks.userId));
  const eventRows = await ctx.db
    .select()
    .from(taskEvents)
    .where(mine(taskEvents.userId))
    .orderBy(asc(taskEvents.createdAt));
  const monitorRows = await ctx.db.select().from(monitors).where(mine(monitors.userId));
  const checkRows = await ctx.db.select().from(monitorChecks).where(mine(monitorChecks.userId));
  const [team] = await ctx.db
    .select({ name: organization.name, role: member.role, joinedAt: member.createdAt })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
  return {
    "account.json": {
      profile,
      settings: (await ctx.db.select().from(settings).where(mine(settings.userId)))[0] ?? null,
      team: team ?? null,
      subscription: toSubscriptionInfo(await subscriptionOf(ctx, "user", userId)),
      usage: await ctx.db.select().from(usageCounters).where(mine(usageCounters.userId)),
      connectedAccounts: (
        await ctx.db.select().from(connections).where(mine(connections.userId))
      ).map((c) => omit(c, ["refreshToken", "userId"])),
      devices: (await ctx.db.select().from(pushDevices).where(mine(pushDevices.userId))).map(
        (d) => ({
          kind: d.kind,
          label: d.label,
          createdAt: d.createdAt,
        }),
      ),
    },
    "chats.json": threadRows.map((t) => ({
      ...omit(t, ["userId", "runningUntil"]),
      messages: messageRows.filter((m) => m.threadId === t.id).map((m) => omit(m, ["userId"])),
    })),
    "tasks.json": taskRows.map((t) => ({
      ...omit(t, ["userId"]),
      events: eventRows.filter((e) => e.taskId === t.id).map((e) => omit(e, ["userId"])),
    })),
    "approvals.json": (await ctx.db.select().from(actions).where(mine(actions.userId))).map((a) =>
      omit(a, ["userId"]),
    ),
    "memories.json": (await ctx.db.select().from(memories).where(mine(memories.userId))).map((m) =>
      omit(m, ["userId", "embedding", "embeddingModel"]),
    ),
    "notifications.json": (
      await ctx.db.select().from(notifications).where(mine(notifications.userId))
    ).map((n) => omit(n, ["userId"])),
    "goals.json": (await ctx.db.select().from(goals).where(mine(goals.userId))).map((g) =>
      omit(g, ["userId"]),
    ),
    "watches.json": monitorRows.map((m) => ({
      ...omit(m, ["userId"]),
      checks: checkRows.filter((c) => c.monitorId === m.id).map((c) => omit(c, ["userId"])),
    })),
    "ideas.json": (await ctx.db.select().from(ideas).where(mine(ideas.userId))).map((i) =>
      omit(i, ["userId"]),
    ),
    "money.json": (
      await ctx.db.select().from(financeReports).where(mine(financeReports.userId))
    ).map((r) => omit(r, ["userId"])),
    "connectors.json": (await ctx.db.select().from(connectors).where(mine(connectors.userId))).map(
      (c) => omit(c, ["userId", "secret"]),
    ),
    "computer.json": (
      await ctx.db.select().from(computerCommands).where(mine(computerCommands.userId))
    ).map((c) => omit(c, ["userId"])),
    "browser.json": (
      await ctx.db.select().from(browserSessions).where(mine(browserSessions.userId))
    ).map((b) => omit(b, ["userId"])),
  };
}

const readme = (
  name: string,
  when: Date,
) => `Agent V export for ${name}, made ${when.toISOString()}.

Everything is JSON (UTF-8) except files/, which holds your documents as they were stored.

account.json        profile, settings, team, plan and usage per month
chats.json          every chat with its messages
tasks.json          background tasks with their step-by-step history
approvals.json      actions the agent proposed and what you decided
memories.json       what the agent remembers about you
goals.json, watches.json, ideas.json, money.json
connectors.json     MCP connectors (without their tokens)
computer.json       commands run on your computer
browser.json        cloud browser sessions
notifications.json
files.json          the list of files; the files themselves are in files/

Secrets (passwords, access tokens, push addresses) are never exported.
`;

/** Stream a ZIP of the account. Rows are read first; file bytes stream one at a time. */
export async function exportAccount(ctx: Context, userId: string) {
  const data = await collect(ctx, userId);
  const fileRows = await ctx.db
    .select()
    .from(files)
    .where(eq(files.userId, userId))
    .orderBy(asc(files.createdAt));
  const name = (data["account.json"].profile?.name as string | undefined) ?? "you";
  const now = new Date();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) return controller.error(error);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const add = (path: string, bytes: Uint8Array, compress = true) => {
        const entry = compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path);
        entry.mtime = now;
        zip.add(entry);
        entry.push(bytes, true);
      };
      try {
        add("README.txt", strToU8(readme(name, now)));
        for (const [path, value] of Object.entries(data))
          add(path, strToU8(JSON.stringify(value, null, 2)));
        const used = new Set<string>();
        const listed = [];
        for (const row of fileRows) {
          let path = `files/${row.name}`;
          if (used.has(path)) path = `files/${row.id.slice(0, 8)} ${row.name}`;
          used.add(path);
          listed.push({ ...omit(row, ["userId"]), path });
          const bytes = await readFile(join(ctx.config.dataDir, "files", userId, row.id)).catch(
            () => null,
          );
          if (bytes) add(path, new Uint8Array(bytes), false);
        }
        add("files.json", strToU8(JSON.stringify(listed, null, 2)));
        zip.end();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
