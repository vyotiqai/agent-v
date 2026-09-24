import {
  type AdminOverview,
  adminUpdateSchema,
  checkoutSchema,
  deleteAccountSchema,
  teamCreateSchema,
  teamInviteSchema,
  teamRoleSchema,
} from "@agent-v/shared";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Hono, Context as HonoContext } from "hono";
import { z } from "zod";
import type { Auth } from "../auth.ts";
import { grantPlan, handleWebhook, openPortal, startCheckout } from "../billing/service.ts";
import { effectivePlan, getUsage, periodOf } from "../billing/usage.ts";
import type { Context } from "../context.ts";
import { usageCounters, user } from "../db/schema.ts";
import { AppError } from "../errors.ts";
import { exportAccount } from "./service.ts";
import { getTeam, teamActions } from "./team.ts";

type Env = { Variables: { userId: string } };

/** Routes reached without a session (Stripe calls these). */
const downloadPath = "/api/account/export/download";

export function publicAccountRoutes(app: Hono<Env>, ctx: Context) {
  app.post("/api/billing/stripe/webhook", async (c) =>
    c.json(await handleWebhook(ctx, await c.req.text(), c.req.header("stripe-signature"))),
  );
  // A short-lived signed link, so phones and the desktop app can download in the browser.
  app.get(downloadPath, async (c) => {
    const userId = ctx.signer.verify(c.req.path, c.req.query());
    if (!userId) throw new AppError("This download link expired. Start the export again.", 401);
    const [owner] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    if (!owner) throw new AppError("Account not found", 404);
    return exportResponse(c, await exportAccount(ctx, userId));
  });
}

function exportResponse(c: HonoContext, stream: ReadableStream) {
  const day = new Date().toISOString().slice(0, 10);
  return c.body(stream, 200, {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="agent-v-export-${day}.zip"`,
    "cache-control": "no-store",
  });
}

export function accountRoutes(app: Hono<Env>, ctx: Context, auth: Auth) {
  const body = async <T extends z.ZodType>(c: { req: { json(): Promise<unknown> } }, schema: T) =>
    schema.parse(await c.req.json().catch(() => ({}))) as z.output<T>;

  // Plan and usage
  app.get("/api/usage", async (c) => c.json(await getUsage(ctx, c.get("userId"))));
  app.post("/api/billing/checkout", async (c) =>
    c.json(await startCheckout(ctx, c.get("userId"), await body(c, checkoutSchema))),
  );
  app.post("/api/billing/portal", async (c) => {
    const { scope } = await body(
      c,
      z.object({ scope: z.enum(["personal", "team"]).default("personal") }),
    );
    return c.json(await openPortal(ctx, c.get("userId"), scope));
  });

  // Your data
  app.get("/api/account/export", async (c) =>
    exportResponse(c, await exportAccount(ctx, c.get("userId"))),
  );
  app.post("/api/account/export-link", (c) =>
    c.json({
      url: `${ctx.config.publicUrl}${downloadPath}?${ctx.signer.sign(c.get("userId"), downloadPath, 5 * 60)}`,
    }),
  );
  app.post("/api/account/delete", async (c) => {
    const { password } = await body(c, deleteAccountSchema);
    await auth.api.deleteUser({ headers: c.req.raw.headers, body: { password } });
    return c.json({ deleted: true });
  });

  // Teams
  const team = teamActions(ctx, auth);
  const headers = (c: { req: { raw: Request } }) => c.req.raw.headers;
  app.get("/api/team", async (c) => c.json(await getTeam(ctx, c.get("userId"))));
  app.post("/api/team", async (c) => {
    const { name } = await body(c, teamCreateSchema);
    return c.json(await team.create(c.get("userId"), headers(c), name), 201);
  });
  app.patch("/api/team", async (c) => {
    const { name } = await body(c, teamCreateSchema);
    return c.json(await team.rename(c.get("userId"), headers(c), name));
  });
  app.delete("/api/team", async (c) => c.json(await team.remove_team(c.get("userId"), headers(c))));
  app.post("/api/team/leave", async (c) => c.json(await team.leave(c.get("userId"), headers(c))));
  app.post("/api/team/invitations", async (c) => {
    const { email, role } = await body(c, teamInviteSchema);
    return c.json(await team.invite(c.get("userId"), headers(c), email, role), 201);
  });
  app.delete("/api/team/invitations/:id", async (c) =>
    c.json(await team.cancelInvitation(c.get("userId"), headers(c), c.req.param("id"))),
  );
  app.post("/api/team/invitations/:id/accept", async (c) =>
    c.json(await team.accept(c.get("userId"), headers(c), c.req.param("id"))),
  );
  app.post("/api/team/invitations/:id/decline", async (c) =>
    c.json(await team.decline(c.get("userId"), headers(c), c.req.param("id"))),
  );
  app.patch("/api/team/members/:id", async (c) => {
    const { role } = await body(c, teamRoleSchema);
    return c.json(await team.setRole(c.get("userId"), headers(c), c.req.param("id"), role));
  });
  app.delete("/api/team/members/:id", async (c) =>
    c.json(await team.remove(c.get("userId"), headers(c), c.req.param("id"))),
  );

  // Operators: accounts, plans and bans. Never anyone's content.
  app.use("/api/admin/*", async (c, next) => {
    const [me] = await ctx.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, c.get("userId")));
    if (me?.role !== "admin") throw new AppError("Not found", 404);
    await next();
  });
  app.get("/api/admin/users", async (c) => {
    const q = z
      .object({
        search: z.string().trim().max(100).default(""),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(c.req.query());
    const where = q.search
      ? or(ilike(user.email, `%${q.search}%`), ilike(user.name, `%${q.search}%`))
      : undefined;
    const rows = await ctx.db
      .select()
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(50)
      .offset(q.offset);
    const period = periodOf();
    const counters = rows.length
      ? await ctx.db
          .select()
          .from(usageCounters)
          .where(
            and(
              inArray(
                usageCounters.userId,
                rows.map((r) => r.id),
              ),
              eq(usageCounters.period, period),
              inArray(usageCounters.metric, ["tokens", "tasks"]),
            ),
          )
      : [];
    const metric = (id: string, name: string) =>
      counters.find((r) => r.userId === id && r.metric === name)?.amount ?? 0;
    const [totals] = await ctx.db
      .select({
        tokens: sql<string>`coalesce(sum(${usageCounters.amount}) filter (where ${usageCounters.metric} = 'tokens'), 0)`,
        tasks: sql<string>`coalesce(sum(${usageCounters.amount}) filter (where ${usageCounters.metric} = 'tasks'), 0)`,
        active: sql<string>`count(distinct ${usageCounters.userId})`,
      })
      .from(usageCounters)
      .where(eq(usageCounters.period, period));
    const [all] = await ctx.db.select({ n: count() }).from(user);
    const [matching] = await ctx.db.select({ n: count() }).from(user).where(where);
    const users = [];
    for (const r of rows) {
      const { plan, source } = await effectivePlan(ctx, r.id);
      users.push({
        id: r.id,
        name: r.name,
        email: r.email,
        emailVerified: r.emailVerified,
        role: r.role,
        banned: Boolean(r.banned),
        banReason: r.banReason,
        createdAt: r.createdAt.toISOString(),
        plan: plan.id,
        planSource: source,
        tokens: metric(r.id, "tokens"),
        tasks: metric(r.id, "tasks"),
      });
    }
    const overview: AdminOverview = {
      users,
      total: matching?.n ?? 0,
      totals: {
        users: all?.n ?? 0,
        activeThisMonth: Number(totals?.active ?? 0),
        tokens: Number(totals?.tokens ?? 0),
        tasks: Number(totals?.tasks ?? 0),
      },
    };
    return c.json(overview);
  });
  app.patch("/api/admin/users/:id", async (c) => {
    const id = c.req.param("id");
    const input = await body(c, adminUpdateSchema);
    const [target] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.id, id));
    if (!target) throw new AppError("Account not found", 404);
    if (input.plan !== undefined) await grantPlan(ctx, id, input.plan);
    if (input.banned === true) {
      if (id === c.get("userId")) throw new AppError("You can't suspend yourself", 422);
      await auth.api.banUser({
        headers: c.req.raw.headers,
        body: { userId: id, banReason: input.banReason || "Suspended by an operator" },
      });
    } else if (input.banned === false)
      await auth.api.unbanUser({ headers: c.req.raw.headers, body: { userId: id } });
    return c.json({ ok: true });
  });
}
