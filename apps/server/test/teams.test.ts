import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signWebhook, stripeApiVersion } from "../src/billing/stripe.ts";
import { startTestServer, TestMailer, type TestServer } from "./helpers.ts";

// A fake Stripe: customers, checkout, the portal and subscriptions, enough for the billing flow.
interface FakeSub {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end: boolean;
  metadata: Record<string, string>;
  items: {
    data: { id: string; quantity: number; current_period_end: number; price: { id: string } }[];
  };
}
const stripe = {
  customers: [] as Record<string, string>[],
  sessions: [] as Record<string, string>[],
  subs: new Map<string, FakeSub>(),
  updates: [] as { id: string; quantity: string; key: string | undefined }[],
  versions: new Set<string>(),
  n: 0,
};
let fake: Server;
let fakeUrl = "";
const secret = "whsec_test_secret";

function startFakeStripe() {
  fake = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const form = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
    stripe.versions.add(String(req.headers["stripe-version"]));
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== "Bearer sk_test_fake")
      return send(401, { error: { message: "Invalid API key" } });
    const url = new URL(req.url ?? "/", "http://x");
    const sub = /^\/v1\/subscriptions\/([\w-]+)$/.exec(url.pathname);
    if (req.method === "POST" && url.pathname === "/v1/customers") {
      stripe.customers.push(form);
      return send(200, { id: `cus_${++stripe.n}` });
    }
    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      stripe.sessions.push(form);
      return send(200, { id: `cs_${++stripe.n}`, url: `https://checkout.test/cs_${stripe.n}` });
    }
    if (req.method === "POST" && url.pathname === "/v1/billing_portal/sessions")
      return send(200, { url: `https://portal.test/${form.customer}` });
    if (sub?.[1] && req.method === "GET") {
      const found = stripe.subs.get(sub[1]);
      return found ? send(200, found) : send(404, { error: { message: "No such subscription" } });
    }
    if (sub?.[1] && req.method === "POST") {
      const found = stripe.subs.get(sub[1]);
      const item = found?.items.data[0];
      if (!found || !item) return send(404, { error: { message: "No such subscription" } });
      stripe.updates.push({
        id: found.id,
        quantity: form["items[0][quantity]"] ?? "",
        key: req.headers["idempotency-key"] as string | undefined,
      });
      item.quantity = Number(form["items[0][quantity]"]);
      return send(200, found);
    }
    if (sub?.[1] && req.method === "DELETE") {
      const found = stripe.subs.get(sub[1]);
      if (found) found.status = "canceled";
      return send(200, found);
    }
    send(404, { error: { message: `No route ${req.method} ${url.pathname}` } });
  });
  return new Promise<void>((resolve) =>
    fake.listen(0, "127.0.0.1", () => {
      fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
      resolve();
    }),
  );
}

/** What Stripe does when checkout succeeds: a subscription exists, then a webhook arrives. */
function completeCheckout(session: Record<string, string>) {
  const id = `sub_${++stripe.n}`;
  stripe.subs.set(id, {
    id,
    status: "active",
    customer: session.customer as string,
    cancel_at_period_end: false,
    metadata: {
      subject_type: session["subscription_data[metadata][subject_type]"] as string,
      subject_id: session["subscription_data[metadata][subject_id]"] as string,
      plan: session["subscription_data[metadata][plan]"] as string,
    },
    items: {
      data: [
        {
          id: `si_${stripe.n}`,
          quantity: Number(session["line_items[0][quantity]"]),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          price: { id: session["line_items[0][price]"] as string },
        },
      ],
    },
  });
  return id;
}

async function webhook(type: string, object: Record<string, unknown>, sign = secret) {
  const body = JSON.stringify({ id: `evt_${++stripe.n}`, type, data: { object } });
  return server.app.fetch(
    new Request("http://localhost:8787/api/billing/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signWebhook(body, sign) },
      body,
    }),
  );
}

async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 15_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out; last ${JSON.stringify(value)}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

const mailer = new TestMailer();
let server: TestServer;
beforeAll(async () => {
  await startFakeStripe();
  server = await startTestServer({
    mailer,
    config: {
      PLANS: "default",
      STRIPE_PRICES: JSON.stringify({ pro: "price_pro", team: "price_team" }),
      STRIPE_SECRET_KEY: "sk_test_fake",
      STRIPE_WEBHOOK_SECRET: secret,
      STRIPE_API_BASE: fakeUrl,
      APP_URL: "http://app.test",
    },
  });
});
afterAll(async () => {
  await server?.close();
  fake?.close();
});

/** Sign up and confirm the email through the link that was sent. */
async function verifiedUser(name: string) {
  const person = await server.signUp(name);
  const link = new URL(mailer.last(person.email, /Confirm your email/)?.action?.url ?? "");
  await server.call(`${link.pathname}${link.search}`);
  return person;
}

describe("personal billing", () => {
  it("checks out through Stripe and applies the plan from the webhook", async () => {
    const { token, email } = await server.signUp("Payer");
    const before = await server.json("/api/usage", { token });
    expect(before).toMatchObject({ plan: { id: "free" }, source: "default", enforced: true });
    expect(
      before.billing.plans.map((p: { id: string; purchasable: boolean }) => [p.id, p.purchasable]),
    ).toEqual([
      ["free", false],
      ["pro", true],
      ["team", true],
    ]);

    const { url } = await server.json("/api/billing/checkout", { token, body: { plan: "pro" } });
    expect(url).toMatch(/^https:\/\/checkout\.test\//);
    const session = stripe.sessions.at(-1) as Record<string, string>;
    expect(session).toMatchObject({
      mode: "subscription",
      "line_items[0][price]": "price_pro",
      "line_items[0][quantity]": "1",
      success_url: "http://app.test/plan?checkout=success",
      "subscription_data[metadata][subject_type]": "user",
    });
    expect(stripe.customers.at(-1)).toMatchObject({ email });
    expect(stripe.versions).toEqual(new Set([stripeApiVersion]));

    // A forged webhook changes nothing.
    const subId = completeCheckout(session);
    expect(
      (await webhook("checkout.session.completed", { subscription: subId }, "whsec_wrong")).status,
    ).toBe(400);
    expect((await server.json("/api/usage", { token })).plan.id).toBe("free");

    expect((await webhook("checkout.session.completed", { subscription: subId })).status).toBe(200);
    const after = await server.json("/api/usage", { token });
    expect(after).toMatchObject({
      plan: { id: "pro" },
      source: "personal",
      billing: { subscription: { plan: "pro", status: "active", managed: true } },
    });
    // Replaying the same event is harmless.
    await webhook("checkout.session.completed", { subscription: subId });
    expect((await server.json("/api/usage", { token })).plan.id).toBe("pro");

    const again = await server.call("/api/billing/checkout", { token, body: { plan: "pro" } });
    expect(again.status).toBe(409);
    const portal = await server.json("/api/billing/portal", { token, body: {} });
    expect(portal.url).toMatch(/^https:\/\/portal\.test\/cus_/);

    // Cancelled in Stripe: back to Free.
    const stored = stripe.subs.get(subId);
    if (stored) stored.status = "canceled";
    await webhook("customer.subscription.deleted", { id: subId });
    expect((await server.json("/api/usage", { token })).plan.id).toBe("free");
  });

  it("refuses plans that don't fit", async () => {
    const { token } = await server.signUp();
    await server.json("/api/billing/checkout", { token, body: { plan: "free" } }, 422);
    await server.json("/api/billing/checkout", { token, body: { plan: "team" } }, 422);
    await server.json(
      "/api/billing/checkout",
      { token, body: { plan: "team", scope: "team" } },
      409,
    );
  });
});

describe("teams", () => {
  it("shares a team plan, keeps seats in sync and keeps usage private to managers", async () => {
    const owner = await verifiedUser("Owner");
    const alice = await verifiedUser("Alice");
    const created = await server.json(
      "/api/team",
      { token: owner.token, body: { name: "Acme Inc" } },
      201,
    );
    expect(created).toMatchObject({ team: { name: "Acme Inc" }, role: "owner" });
    expect(created.members).toHaveLength(1);

    // Buy the team plan for the one member so far.
    await server.json("/api/billing/checkout", {
      token: owner.token,
      body: { plan: "team", scope: "team" },
    });
    const session = stripe.sessions.at(-1) as Record<string, string>;
    expect(session).toMatchObject({
      "line_items[0][price]": "price_team",
      "line_items[0][quantity]": "1",
      "subscription_data[metadata][subject_type]": "organization",
    });
    const subId = completeCheckout(session);
    await webhook("customer.subscription.created", { id: subId });
    expect((await server.json("/api/usage", { token: owner.token })).plan.id).toBe("team");

    // Invite Alice: an email and, since she has an account, a notification.
    const invite = await server.json(
      "/api/team/invitations",
      { token: owner.token, body: { email: alice.email } },
      201,
    );
    expect(invite.link).toBe(`http://app.test/team?invite=${invite.id}`);
    expect(mailer.last(alice.email, /invited you to Acme Inc/)?.action?.url).toBe(invite.link);
    const notes = await server.json("/api/notifications", { token: alice.token });
    expect(notes[0]).toMatchObject({
      title: "Invitation to Acme Inc",
      link: `/team?invite=${invite.id}`,
    });
    const pending = await server.json("/api/team", { token: alice.token });
    expect(pending.team).toBeNull();
    expect(pending.received[0]).toMatchObject({
      id: invite.id,
      teamName: "Acme Inc",
      inviter: "Owner",
    });

    const joined = await server.json(`/api/team/invitations/${invite.id}/accept`, {
      token: alice.token,
      body: {},
    });
    expect(joined).toMatchObject({ role: "member", team: { name: "Acme Inc" } });
    // Members see who is in the team, not how much anyone uses.
    expect(joined.members.map((m: { tokens: number | null }) => m.tokens)).toEqual([null, null]);
    expect(await server.json("/api/usage", { token: alice.token })).toMatchObject({
      plan: { id: "team" },
      source: "team",
    });
    await eventually(
      async () => stripe.subs.get(subId)?.items.data[0]?.quantity,
      (q) => q === 2,
    );
    expect(stripe.updates.at(-1)).toMatchObject({ id: subId, quantity: "2" });
    expect(stripe.updates.at(-1)?.key).toBeTruthy();

    const thread = await server.json("/api/threads", { token: alice.token, body: {} }, 201);
    await server.run(alice.token, thread.id, "Hi!");
    const managed = await server.json("/api/team", { token: owner.token });
    const aliceRow = managed.members.find((m: { email: string }) => m.email === alice.email);
    expect(aliceRow.tokens).toBeGreaterThan(0);

    // Roles: members can't manage; an owner can promote.
    await server.json(
      "/api/team/invitations",
      { token: alice.token, body: { email: "x@example.com" } },
      403,
    );
    await server.json(`/api/team/members/${aliceRow.id}`, {
      token: owner.token,
      method: "PATCH",
      body: { role: "admin" },
    });
    expect((await server.json("/api/team", { token: alice.token })).role).toBe("admin");

    // The owner can't delete their account while others depend on the team.
    const blocked = await server.call("/api/account/delete", {
      token: owner.token,
      body: { password: "a-long-password-1" },
    });
    expect(blocked.status).toBe(400);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/team owner/);

    // Alice leaves: her plan falls back to Free and the seats follow.
    await server.json("/api/team/leave", { token: alice.token, body: {} });
    expect((await server.json("/api/usage", { token: alice.token })).plan.id).toBe("free");
    await eventually(
      async () => stripe.subs.get(subId)?.items.data[0]?.quantity,
      (q) => q === 1,
    );
  });

  it("allows one team per person and invitations only for their addressee", async () => {
    const bob = await verifiedUser("Bob");
    const carol = await verifiedUser("Carol");
    const dave = await server.signUp("Dave"); // never confirms his email
    await server.json("/api/team", { token: bob.token, body: { name: "Bob's team" } }, 201);
    await server.json("/api/team", { token: bob.token, body: { name: "Another" } }, 400);

    const forDave = await server.json(
      "/api/team/invitations",
      { token: bob.token, body: { email: dave.email } },
      201,
    );
    // Carol can't use Dave's invitation, and Dave must confirm his email first.
    expect(
      (
        await server.call(`/api/team/invitations/${forDave.id}/accept`, {
          token: carol.token,
          body: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await server.call(`/api/team/invitations/${forDave.id}/accept`, {
          token: dave.token,
          body: {},
        })
      ).status,
    ).toBe(403);
    // Unconfirmed accounts don't get the in-app notification either.
    expect(await server.json("/api/notifications", { token: dave.token })).toEqual([]);

    // Better Auth's organization endpoints are only reachable through /api/team.
    const direct = await server.call("/api/auth/organization/create", {
      token: carol.token,
      body: { name: "Sneaky", slug: "sneaky" },
    });
    expect(direct.status).toBe(404);
  });
});
