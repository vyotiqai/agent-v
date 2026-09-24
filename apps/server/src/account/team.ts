import type { TeamInfo, TeamRole } from "@agent-v/shared";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { Auth } from "../auth.ts";
import { cancelSubscriptions, enqueueSeatSync, teamSubscriptions } from "../billing/service.ts";
import { forgetPlans, periodOf, toSubscriptionInfo } from "../billing/usage.ts";
import { type Context, newId } from "../context.ts";
import { invitation, member, organization, usageCounters, user } from "../db/schema.ts";
import { AppError } from "../errors.ts";
import { notify } from "../workspace.ts";

async function membershipOf(ctx: Context, userId: string) {
  const [row] = await ctx.db
    .select({
      memberId: member.id,
      role: member.role,
      organizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
  return row;
}

async function requireManager(ctx: Context, userId: string) {
  const m = await membershipOf(ctx, userId);
  if (!m) throw new AppError("You're not in a team", 404);
  if (m.role === "member") throw new AppError("Only team owners and admins can do that", 403);
  return m;
}

const inviteLink = (ctx: Context, id: string) => `${ctx.config.appUrl}/team?invite=${id}`;

export async function getTeam(ctx: Context, userId: string): Promise<TeamInfo> {
  const [me] = await ctx.db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  const received = await ctx.db
    .select({
      id: invitation.id,
      teamName: organization.name,
      inviter: user.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(user, eq(user.id, invitation.inviterId))
    .where(
      and(
        sql`lower(${invitation.email}) = lower(${me?.email ?? ""})`,
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    );
  const base = {
    received: received.map((r) => ({
      ...r,
      role: (r.role ?? "member") as TeamRole,
      expiresAt: r.expiresAt.toISOString(),
    })),
  };
  const m = await membershipOf(ctx, userId);
  if (!m) return { team: null, role: null, members: [], invitations: [], ...base };
  const manager = m.role !== "member";
  const rows = await ctx.db
    .select({
      id: member.id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, m.organizationId))
    .orderBy(member.createdAt);
  // Managers see how much each member uses (numbers only, never content).
  const tokens = manager
    ? new Map(
        (
          await ctx.db
            .select({ userId: usageCounters.userId, amount: usageCounters.amount })
            .from(usageCounters)
            .where(
              and(
                inArray(
                  usageCounters.userId,
                  rows.map((r) => r.userId),
                ),
                eq(usageCounters.period, periodOf()),
                eq(usageCounters.metric, "tokens"),
              ),
            )
        ).map((r) => [r.userId, r.amount]),
      )
    : null;
  const invitations = manager
    ? await ctx.db
        .select()
        .from(invitation)
        .where(
          and(
            eq(invitation.organizationId, m.organizationId),
            eq(invitation.status, "pending"),
            gt(invitation.expiresAt, new Date()),
          ),
        )
    : [];
  const [subscription] = await teamSubscriptions(ctx, [m.organizationId]);
  return {
    team: {
      id: m.organizationId,
      name: m.name,
      slug: m.slug,
      createdAt: m.createdAt.toISOString(),
      subscription: toSubscriptionInfo(subscription),
    },
    role: m.role as TeamRole,
    members: rows.map((r) => ({
      ...r,
      role: r.role as TeamRole,
      joinedAt: r.joinedAt.toISOString(),
      tokens: tokens ? (tokens.get(r.userId) ?? 0) : null,
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: (i.role ?? "member") as TeamRole,
      status: i.status,
      expiresAt: i.expiresAt.toISOString(),
      link: inviteLink(ctx, i.id),
    })),
    ...base,
  };
}

async function membersOf(ctx: Context, organizationId: string) {
  const rows = await ctx.db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  return rows.map((r) => r.userId);
}

/** After membership changes: plans may differ, seats may need billing, screens refresh. */
async function membershipChanged(ctx: Context, organizationId: string, extra: string[] = []) {
  const people = [...(await membersOf(ctx, organizationId)), ...extra];
  forgetPlans(people);
  await enqueueSeatSync(ctx, organizationId).catch((error) =>
    console.error("[billing] seat sync:", (error as Error).message),
  );
  for (const id of people) {
    await ctx.realtime.publish(id, { type: "team", id: organizationId });
    await ctx.realtime.publish(id, { type: "usage", id: "plan" });
  }
}

const slugFor = (name: string) =>
  `${
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "team"
  }-${newId().slice(0, 6)}`;

export function teamActions(ctx: Context, auth: Auth) {
  return {
    async create(userId: string, headers: Headers, name: string) {
      const org = await auth.api.createOrganization({
        headers,
        body: { name, slug: slugFor(name) },
      });
      if (!org) throw new AppError("The team could not be created", 500);
      await membershipChanged(ctx, org.id);
      return getTeam(ctx, userId);
    },

    async rename(userId: string, headers: Headers, name: string) {
      const m = await requireManager(ctx, userId);
      await auth.api.updateOrganization({
        headers,
        body: { organizationId: m.organizationId, data: { name } },
      });
      await membershipChanged(ctx, m.organizationId);
      return getTeam(ctx, userId);
    },

    async invite(userId: string, headers: Headers, email: string, role: "admin" | "member") {
      const m = await requireManager(ctx, userId);
      const created = await auth.api.createInvitation({
        headers,
        body: { organizationId: m.organizationId, email, role },
      });
      // Someone who already has an account also hears about it in the app.
      const [invitee] = await ctx.db
        .select({ id: user.id, verified: user.emailVerified })
        .from(user)
        .where(sql`lower(${user.email}) = lower(${email})`);
      if (invitee && (invitee.verified || !ctx.mailer.delivers))
        await notify(ctx, invitee.id, {
          title: `Invitation to ${m.name}`,
          body: "Open to join the team and share its plan.",
          link: `/team?invite=${created.id}`,
          category: "needs_you",
          dedupeKey: `invite:${created.id}`,
        });
      return { id: created.id, link: inviteLink(ctx, created.id) };
    },

    async cancelInvitation(userId: string, headers: Headers, invitationId: string) {
      await requireManager(ctx, userId);
      await auth.api.cancelInvitation({ headers, body: { invitationId } });
      return getTeam(ctx, userId);
    },

    async accept(userId: string, headers: Headers, invitationId: string) {
      const result = await auth.api.acceptInvitation({ headers, body: { invitationId } });
      if (result?.member) await membershipChanged(ctx, result.member.organizationId);
      return getTeam(ctx, userId);
    },

    async decline(userId: string, headers: Headers, invitationId: string) {
      await auth.api.rejectInvitation({ headers, body: { invitationId } });
      return getTeam(ctx, userId);
    },

    async setRole(userId: string, headers: Headers, memberId: string, role: TeamRole) {
      const m = await requireManager(ctx, userId);
      if (role === "owner" && m.role !== "owner")
        throw new AppError("Only an owner can make someone an owner", 403);
      await auth.api.updateMemberRole({
        headers,
        body: { organizationId: m.organizationId, memberId, role },
      });
      await membershipChanged(ctx, m.organizationId);
      return getTeam(ctx, userId);
    },

    async remove(userId: string, headers: Headers, memberId: string) {
      const m = await requireManager(ctx, userId);
      const [target] = await ctx.db
        .select({ userId: member.userId })
        .from(member)
        .where(and(eq(member.id, memberId), eq(member.organizationId, m.organizationId)));
      if (!target) throw new AppError("Member not found", 404);
      await auth.api.removeMember({
        headers,
        body: { organizationId: m.organizationId, memberIdOrEmail: memberId },
      });
      await membershipChanged(ctx, m.organizationId, [target.userId]);
      return getTeam(ctx, userId);
    },

    async leave(userId: string, headers: Headers) {
      const m = await membershipOf(ctx, userId);
      if (!m) throw new AppError("You're not in a team", 404);
      await auth.api.leaveOrganization({ headers, body: { organizationId: m.organizationId } });
      await membershipChanged(ctx, m.organizationId, [userId]);
      return getTeam(ctx, userId);
    },

    async remove_team(userId: string, headers: Headers) {
      const m = await membershipOf(ctx, userId);
      if (m?.role !== "owner") throw new AppError("Only the owner can delete the team", 403);
      const people = await membersOf(ctx, m.organizationId);
      if (ctx.config.stripe) await cancelSubscriptions(ctx, "organization", m.organizationId);
      await auth.api.deleteOrganization({ headers, body: { organizationId: m.organizationId } });
      forgetPlans(people);
      for (const id of people) {
        await ctx.realtime.publish(id, { type: "team", id: m.organizationId });
        await ctx.realtime.publish(id, { type: "usage", id: "plan" });
      }
      return getTeam(ctx, userId);
    },
  };
}
