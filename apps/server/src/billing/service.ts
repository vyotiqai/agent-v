import { DBOS } from "@dbos-inc/dbos-sdk";
import { and, eq, inArray } from "drizzle-orm";
import { type Context, newId } from "../context.ts";
import {
  billingCustomers,
  member,
  organization,
  type SubjectType,
  subscriptions,
  user,
} from "../db/schema.ts";
import { AppError } from "../errors.ts";
import { enqueue } from "../queue.ts";
import { Stripe, type StripeSubscription, verifyWebhook } from "./stripe.ts";
import { forgetPlans, planById } from "./usage.ts";

export const billingQueue = "billing";
const liveStatuses = new Set(["active", "trialing", "past_due"]);

function stripeOf(ctx: Context) {
  const config = ctx.config.stripe;
  if (!config) throw new AppError("Billing is not set up on this server", 503);
  return new Stripe(config.secretKey, config.apiBase);
}

interface Subject {
  type: SubjectType;
  id: string;
  email: string;
  name: string;
  /** People the plan covers (a team's members). */
  seats: number;
}

/** Whom a purchase is for: the person, or the team they run (owners and admins only). */
async function subjectFor(ctx: Context, userId: string, scope: "personal" | "team") {
  const [me] = await ctx.db.select().from(user).where(eq(user.id, userId));
  if (!me) throw new AppError("Account not found", 404);
  if (scope === "personal")
    return { type: "user", id: userId, email: me.email, name: me.name, seats: 1 } as Subject;
  const [membership] = await ctx.db
    .select({ organizationId: member.organizationId, role: member.role, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
  if (!membership) throw new AppError("Create a team first", 409);
  if (membership.role === "member")
    throw new AppError("Only team owners and admins manage the team's plan", 403);
  const seats = await ctx.db.$count(member, eq(member.organizationId, membership.organizationId));
  return {
    type: "organization",
    id: membership.organizationId,
    email: me.email,
    name: membership.name,
    seats,
  } as Subject;
}

async function customerFor(ctx: Context, subject: Subject, create: boolean) {
  const [existing] = await ctx.db
    .select()
    .from(billingCustomers)
    .where(
      and(
        eq(billingCustomers.subjectType, subject.type),
        eq(billingCustomers.subjectId, subject.id),
      ),
    );
  if (existing) return existing.customerId;
  if (!create) throw new AppError("There is no billing account yet", 404);
  const customer = await stripeOf(ctx).createCustomer(
    {
      email: subject.email,
      name: subject.name,
      "metadata[subject_type]": subject.type,
      "metadata[subject_id]": subject.id,
    },
    `customer:${subject.type}:${subject.id}`,
  );
  await ctx.db
    .insert(billingCustomers)
    .values({ subjectType: subject.type, subjectId: subject.id, customerId: customer.id })
    .onConflictDoNothing();
  return customer.id;
}

async function stripeRow(ctx: Context, type: SubjectType, id: string) {
  const [row] = await ctx.db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.subjectType, type),
        eq(subscriptions.subjectId, id),
        eq(subscriptions.provider, "stripe"),
      ),
    );
  return row;
}

/** A Stripe Checkout page for a plan. */
export async function startCheckout(
  ctx: Context,
  userId: string,
  input: { plan: string; scope: "personal" | "team" },
) {
  const plan = planById(ctx, input.plan);
  if (!plan?.stripePrice) throw new AppError("That plan can't be bought here", 422);
  if (plan.team !== (input.scope === "team"))
    throw new AppError(
      plan.team ? "Team plans are bought for a team" : "This plan is for one person",
      422,
    );
  const subject = await subjectFor(ctx, userId, input.scope);
  const current = await stripeRow(ctx, subject.type, subject.id);
  if (current && liveStatuses.has(current.status))
    throw new AppError("There is already a subscription. Change it from Manage billing.", 409);
  const customer = await customerFor(ctx, subject, true);
  const session = await stripeOf(ctx).createCheckout({
    mode: "subscription",
    customer,
    "line_items[0][price]": plan.stripePrice,
    "line_items[0][quantity]": subject.seats,
    success_url: `${ctx.config.appUrl}/plan?checkout=success`,
    cancel_url: `${ctx.config.appUrl}/plan`,
    client_reference_id: `${subject.type}:${subject.id}`,
    "subscription_data[metadata][subject_type]": subject.type,
    "subscription_data[metadata][subject_id]": subject.id,
    "subscription_data[metadata][plan]": plan.id,
    allow_promotion_codes: true,
  });
  return { url: session.url };
}

/** Stripe's billing portal: change plan, update the card, see invoices, cancel. */
export async function openPortal(ctx: Context, userId: string, scope: "personal" | "team") {
  const subject = await subjectFor(ctx, userId, scope);
  const customer = await customerFor(ctx, subject, false);
  const portal = await stripeOf(ctx).createPortal({
    customer,
    return_url: `${ctx.config.appUrl}/plan`,
  });
  return { url: portal.url };
}

/** Everyone a subject's plan applies to. */
async function peopleOf(ctx: Context, type: SubjectType, id: string) {
  if (type === "user") return [id];
  const rows = await ctx.db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, id));
  return rows.map((r) => r.userId);
}

async function planChanged(ctx: Context, type: SubjectType, id: string) {
  const people = await peopleOf(ctx, type, id);
  forgetPlans(people);
  for (const userId of people) await ctx.realtime.publish(userId, { type: "usage", id: "plan" });
}

/**
 * Bring our copy of a subscription up to date by reading it from Stripe (never trusting the
 * event body, so replays and out-of-order events settle on the latest state).
 */
export async function syncSubscription(ctx: Context, externalId: string) {
  const sub = await stripeOf(ctx).getSubscription(externalId);
  let type = sub.metadata.subject_type as SubjectType | undefined;
  let id = sub.metadata.subject_id;
  if (!type || !id) {
    const [customer] = await ctx.db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.customerId, sub.customer));
    if (!customer) return null;
    type = customer.subjectType;
    id = customer.subjectId;
  }
  const item = sub.items.data[0];
  const plan =
    ctx.config.plans.list.find((p) => p.stripePrice && p.stripePrice === item?.price.id)?.id ??
    sub.metadata.plan;
  if (!plan) return null;
  const existing = await stripeRow(ctx, type, id);
  // A late event for an old, ended subscription must not override a newer live one.
  if (
    existing &&
    existing.externalId !== sub.id &&
    liveStatuses.has(existing.status) &&
    !liveStatuses.has(sub.status)
  )
    return existing;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  const values = {
    plan,
    status: sub.status,
    customerId: sub.customer,
    externalId: sub.id,
    itemId: item?.id ?? null,
    seats: item?.quantity ?? null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
  const [row] = await ctx.db
    .insert(subscriptions)
    .values({ id: newId(), subjectType: type, subjectId: id, provider: "stripe", ...values })
    .onConflictDoUpdate({
      target: [subscriptions.subjectType, subscriptions.subjectId, subscriptions.provider],
      set: values,
    })
    .returning();
  await planChanged(ctx, type, id);
  if (type === "organization" && liveStatuses.has(sub.status)) await enqueueSeatSync(ctx, id);
  return row;
}

const handled = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export async function handleWebhook(ctx: Context, body: string, signature: string | undefined) {
  const config = ctx.config.stripe;
  if (!config) throw new AppError("Billing is not set up on this server", 503);
  const event = verifyWebhook(body, signature, config.webhookSecret);
  if (!handled.has(event.type)) return { received: true, handled: false };
  const object = event.data.object;
  const subscriptionId =
    event.type === "checkout.session.completed" ? object.subscription : object.id;
  if (typeof subscriptionId === "string") await syncSubscription(ctx, subscriptionId);
  return { received: true, handled: true };
}

/** Keep a team subscription's quantity equal to its member count. */
export async function syncSeats(ctx: Context, organizationId: string) {
  const row = await stripeRow(ctx, "organization", organizationId);
  if (!row?.externalId || !row.itemId || !liveStatuses.has(row.status)) return null;
  const seats = await ctx.db.$count(member, eq(member.organizationId, organizationId));
  if (seats === row.seats || seats === 0) return row.seats;
  const sub: StripeSubscription = await stripeOf(ctx).updateSubscription(
    row.externalId,
    {
      "items[0][id]": row.itemId,
      "items[0][quantity]": seats,
      proration_behavior: "create_prorations",
    },
    `seats:${row.externalId}:${seats}:${row.updatedAt.getTime()}`,
  );
  await ctx.db
    .update(subscriptions)
    .set({ seats: sub.items.data[0]?.quantity ?? seats })
    .where(eq(subscriptions.id, row.id));
  return seats;
}

let context: Context | undefined;
export function setBillingContext(ctx: Context) {
  context = ctx;
}

async function seatsFunction(organizationId: string) {
  const c = context;
  if (!c) throw new Error("Billing context is not configured");
  await DBOS.runStep(() => syncSeats(c, organizationId), {
    name: "sync",
    retriesAllowed: true,
    maxAttempts: 6,
    intervalSeconds: 5,
    backoffRate: 2,
  });
}
DBOS.registerWorkflow(seatsFunction, { name: "billing-seats" });

/** Queue a seat update after members join or leave; retried until Stripe accepts it. */
export async function enqueueSeatSync(ctx: Context, organizationId: string) {
  if (!ctx.config.stripe) return;
  const row = await stripeRow(ctx, "organization", organizationId);
  if (!row || !liveStatuses.has(row.status)) return;
  const seats = await ctx.db.$count(member, eq(member.organizationId, organizationId));
  await enqueue(
    {
      queue: billingQueue,
      workflow: "billing-seats",
      id: `seats:${organizationId}:${seats}:${newId().slice(0, 8)}`,
      user: `organization:${organizationId}`,
    },
    organizationId,
  );
}

/** End a subject's paid subscription now (account or team deletion). */
export async function cancelSubscriptions(ctx: Context, type: SubjectType, id: string) {
  const row = await stripeRow(ctx, type, id);
  if (row?.externalId && liveStatuses.has(row.status))
    await stripeOf(ctx).cancelSubscription(row.externalId);
  await ctx.db
    .delete(subscriptions)
    .where(and(eq(subscriptions.subjectType, type), eq(subscriptions.subjectId, id)));
  await ctx.db
    .delete(billingCustomers)
    .where(and(eq(billingCustomers.subjectType, type), eq(billingCustomers.subjectId, id)));
}

/** An operator grants (or removes) a plan without payment. */
export async function grantPlan(ctx: Context, userId: string, plan: string | null) {
  if (plan === null)
    await ctx.db
      .delete(subscriptions)
      .where(
        and(
          eq(subscriptions.subjectType, "user"),
          eq(subscriptions.subjectId, userId),
          eq(subscriptions.provider, "grant"),
        ),
      );
  else {
    if (!planById(ctx, plan)) throw new AppError(`Unknown plan "${plan}"`, 422);
    await ctx.db
      .insert(subscriptions)
      .values({
        id: newId(),
        subjectType: "user",
        subjectId: userId,
        provider: "grant",
        plan,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [subscriptions.subjectType, subscriptions.subjectId, subscriptions.provider],
        set: { plan, status: "active" },
      });
  }
  await planChanged(ctx, "user", userId);
}

/** Team subscriptions for a set of teams (for the team screen). */
export async function teamSubscriptions(ctx: Context, organizationIds: string[]) {
  if (!organizationIds.length) return [];
  return ctx.db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.subjectType, "organization"),
        inArray(subscriptions.subjectId, organizationIds),
      ),
    );
}
