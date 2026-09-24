import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { EventType } from "@ag-ui/core";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monitors } from "../src/db/schema.ts";
import { analyzeTransactions } from "../src/finance/analyze.ts";
import { findPrices, recordCheck } from "../src/monitors/service.ts";
import { sweepSchedule } from "../src/monitors/workflow.ts";
import { must, startTestServer, type TestServer } from "./helpers.ts";

let server: TestServer;
let web: Server;
let webUrl = "";
let page = { status: 200, body: "" };

beforeAll(async () => {
  server = await startTestServer();
  web = createServer((_req, res) => {
    res.writeHead(page.status, { "content-type": "text/html; charset=utf-8" });
    res.end(page.body);
  });
  await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
  webUrl = `http://127.0.0.1:${(web.address() as AddressInfo).port}/item`;
});
afterAll(async () => {
  await server?.close();
  await new Promise((resolve) => web?.close(resolve));
});

async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 15_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out; last value ${JSON.stringify(value)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const toolNames = (events: { type: string }[]) =>
  events
    .filter((e) => e.type === EventType.TOOL_CALL_START)
    .map((e) => (e as unknown as { toolCallName: string }).toolCallName);
const replyText = (events: { type: string }[]) =>
  events
    .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((e) => (e as unknown as { delta: string }).delta)
    .join("");

describe("goals", () => {
  it("tracks milestones, keeps them private, and checks them off as tasks finish", async () => {
    const { token } = await server.signUp();
    const goal = await server.json(
      "/api/goals",
      {
        token,
        body: { title: "Run a half marathon", milestones: ["Run 5 km", "Run 10 km"] },
      },
      201,
    );
    expect(goal).toMatchObject({ status: "active", category: "Personal" });
    expect(goal.milestones.map((m: { title: string }) => m.title)).toEqual([
      "Run 5 km",
      "Run 10 km",
    ]);
    const [first, second] = goal.milestones;

    // Edits keep ids (and linked tasks); new milestones get one.
    const edited = await server.json(`/api/goals/${goal.id}`, {
      token,
      method: "PATCH",
      body: {
        milestones: [
          { id: first.id, title: "Run 5 km without stopping", done: false },
          { id: second.id, title: "Run 10 km", done: false },
          { title: "Sign up for a race" },
        ],
      },
    });
    expect(edited.milestones[0]).toMatchObject({
      id: first.id,
      title: "Run 5 km without stopping",
    });
    expect(edited.milestones[2].id).toBeTruthy();

    const other = await server.signUp();
    await server.json(`/api/goals/${goal.id}`, { token: other.token }, 404);
    await server.json(
      "/api/tasks",
      { token: other.token, body: { prompt: "Sneak in", goalId: goal.id } },
      404,
    );

    // A task for a milestone checks it off when it succeeds.
    const task = await server.json(
      `/api/goals/${goal.id}/work`,
      { token, body: { milestoneId: first.id } },
      201,
    );
    expect(task.goalId).toBe(goal.id);
    await server.waitForTask(token, task.id, ["succeeded"]);
    // Any other finished task for the goal is added as a completed milestone.
    const extra = await server.json(
      "/api/tasks",
      { token, body: { prompt: "Research running shoes", goalId: goal.id } },
      201,
    );
    await server.waitForTask(token, extra.id, ["succeeded"]);
    const detail = await server.json(`/api/goals/${goal.id}`, { token });
    expect(
      detail.goal.milestones.map((m: { title: string; done: boolean; taskId: string | null }) => [
        m.title,
        m.done,
        m.taskId,
      ]),
    ).toEqual([
      ["Run 5 km without stopping", true, task.id],
      ["Run 10 km", false, null],
      ["Sign up for a race", false, null],
      ["Research running shoes", true, extra.id],
    ]);
    expect(detail.tasks.map((t: { id: string }) => t.id).sort()).toEqual(
      [task.id, extra.id].sort(),
    );

    await server.call(`/api/goals/${goal.id}`, { token, method: "DELETE" });
    await server.json(`/api/goals/${goal.id}`, { token }, 404);
    expect((await server.json(`/api/tasks/${task.id}`, { token })).task.goalId).toBeNull();
  });

  it("plans a goal with a durable task that adds milestones", async () => {
    const { token } = await server.signUp();
    const goal = await server.json("/api/goals", { token, body: { title: "Learn Spanish" } }, 201);
    const task = await server.json(`/api/goals/${goal.id}/work`, { token, body: {} }, 201);
    expect(task.title).toBe("Plan: Learn Spanish");
    await server.waitForTask(token, task.id, ["succeeded"]);
    const { goal: planned } = await server.json(`/api/goals/${goal.id}`, { token });
    expect(planned.milestones).toHaveLength(4);
    expect(planned.milestones.every((m: { done: boolean }) => !m.done)).toBe(true);
    expect(planned.milestones[0].title).toContain("Learn Spanish");
  });
});

describe("page watches", () => {
  it("alerts once when text appears on a page", async () => {
    const { token } = await server.signUp();
    const watch = await server.json(
      "/api/monitors",
      {
        token,
        body: {
          title: "Saturday table",
          url: "demo://availability",
          condition: "contains",
          value: "table available",
          intervalMinutes: 30,
        },
      },
      201,
    );
    const read = () => server.json(`/api/monitors/${watch.id}`, { token });
    let detail = await eventually(read, (d) => d.monitor.checks === 1);
    expect(detail.monitor).toMatchObject({ matched: false, status: "active", failures: 0 });
    expect(detail.checks[0]).toMatchObject({ outcome: "waiting" });
    expect(Date.parse(detail.monitor.nextCheckAt) - Date.now()).toBeGreaterThan(29 * 60_000);

    await server.json("/api/demo-pages/availability", {
      token,
      method: "PUT",
      body: { text: "Harbor Bistro\n7:00 PM: Table available for 2" },
    });
    await server.json(`/api/monitors/${watch.id}/control`, { token, body: { action: "check" } });
    detail = await eventually(read, (d) => d.monitor.checks === 2);
    expect(detail.monitor.matched).toBe(true);
    expect(detail.checks[0]).toMatchObject({ outcome: "matched" });
    expect(detail.checks[0].detail).toContain("7:00 PM: Table available for 2");

    // Still matching: no second alert.
    await server.json(`/api/monitors/${watch.id}/control`, { token, body: { action: "check" } });
    await eventually(read, (d) => d.monitor.checks === 3);
    const alerts = (await server.json("/api/notifications", { token })).filter(
      (n: { title: string }) => n.title === "Found: Saturday table",
    );
    expect(alerts).toHaveLength(1);

    const other = await server.signUp();
    await server.json(`/api/monitors/${watch.id}`, { token: other.token }, 404);
    // Each person has their own copy of the demo page.
    expect(
      (await server.json("/api/demo-pages/availability", { token: other.token })).text,
    ).toContain("Fully booked");
  });

  it("describes page changes and price drops", async () => {
    const { token } = await server.signUp();
    const changes = await server.json(
      "/api/monitors",
      { token, body: { title: "Headphones page", url: "demo://price", condition: "change" } },
      201,
    );
    const price = await server.json(
      "/api/monitors",
      {
        token,
        body: {
          title: "Headphones under 300",
          url: "demo://price",
          condition: "price_below",
          value: "300",
          currency: "USD",
        },
      },
      201,
    );
    const read = (id: string) => () => server.json(`/api/monitors/${id}`, { token });
    let a = await eventually(read(changes.id), (d) => d.monitor.checks === 1);
    let b = await eventually(read(price.id), (d) => d.monitor.checks === 1);
    expect(a.checks[0].outcome).toBe("baseline");
    expect(b.monitor).toMatchObject({ matched: false, lastPrice: 349 });

    await server.json("/api/demo-pages/price", {
      token,
      method: "PUT",
      body: { text: "Quiet Comfort noise-cancelling headphones\nPrice: $279.00\nFree shipping." },
    });
    for (const id of [changes.id, price.id])
      await server.json(`/api/monitors/${id}/control`, { token, body: { action: "check" } });
    a = await eventually(read(changes.id), (d) => d.monitor.checks === 2);
    b = await eventually(read(price.id), (d) => d.monitor.checks === 2);
    expect(a.checks[0]).toMatchObject({ outcome: "changed" });
    expect(a.checks[0].detail).toContain("Now: Price: $279.00");
    expect(a.checks[0].detail).toContain("Before: Price: $349.00");
    expect(b.monitor).toMatchObject({ matched: true, lastPrice: 279 });
    const titles = (await server.json("/api/notifications", { token })).map(
      (n: { title: string }) => n.title,
    );
    expect(titles).toContain("Changed: Headphones page");
    expect(titles).toContain("Price drop: Headphones under 300");
  });

  it("backs off on failures, pauses after five, and resumes cleanly", async () => {
    const { token } = await server.signUp();
    page = { status: 200, body: "<title>Item</title><p>Now €1.299,00</p>" };
    const watch = await server.json(
      "/api/monitors",
      {
        token,
        body: {
          title: "Laptop in euros",
          url: webUrl,
          condition: "price_below",
          value: "1000",
          currency: "EUR",
          intervalMinutes: 10,
        },
      },
      201,
    );
    const read = () => server.json(`/api/monitors/${watch.id}`, { token });
    const first = await eventually(read, (d) => d.monitor.checks === 1);
    expect(first.monitor.lastPrice).toBe(1299);

    page = { status: 503, body: "down" };
    for (let n = 1; n <= 5; n++) {
      await server.json(`/api/monitors/${watch.id}/control`, { token, body: { action: "check" } });
      const d = await eventually(read, (x) => x.monitor.checks === n + 1);
      expect(d.monitor.failures).toBe(n);
      expect(d.monitor.error).toContain("HTTP 503");
      if (n < 5) {
        // Exponential backoff from the 10-minute interval.
        const wait = Date.parse(d.monitor.nextCheckAt) - Date.parse(d.monitor.lastCheckedAt);
        expect(Math.round(wait / 60_000)).toBe(10 * 2 ** (n - 1));
      } else expect(d.monitor).toMatchObject({ status: "paused", nextCheckAt: null });
    }
    const paused = (await server.json("/api/notifications", { token })).filter(
      (n: { title: string }) => n.title === "Watch paused: Laptop in euros",
    );
    expect(paused).toHaveLength(1);
    await server.json(
      `/api/monitors/${watch.id}/control`,
      { token, body: { action: "check" } },
      409,
    );

    page = { status: 200, body: "<p>Sale: €899,00</p>" };
    await server.json(`/api/monitors/${watch.id}/control`, { token, body: { action: "resume" } });
    const resumed = await eventually(read, (d) => d.monitor.checks === 7);
    expect(resumed.monitor).toMatchObject({
      status: "active",
      failures: 0,
      matched: true,
      lastPrice: 899,
    });

    await server.json(`/api/monitors/${watch.id}/control`, { token, body: { action: "stop" } });
    await server.json(
      `/api/monitors/${watch.id}/control`,
      { token, body: { action: "resume" } },
      409,
    );
  });

  it("runs each due check once from the scheduler, and ignores stale checks", async () => {
    const { token, userId } = await server.signUp();
    const watch = await server.json(
      "/api/monitors",
      { token, body: { title: "Scheduled", url: "demo://price", condition: "change" } },
      201,
    );
    const read = () => server.json(`/api/monitors/${watch.id}`, { token });
    await eventually(read, (d) => d.monitor.checks === 1);
    expect(await DBOS.getSchedule(sweepSchedule)).toMatchObject({ schedule: "* * * * *" });

    // Make the watch due, then fire the scheduler twice: one check for the slot.
    const due = new Date(Date.now() - 1000);
    await server.ctx.db.update(monitors).set({ nextCheckAt: due }).where(eq(monitors.id, watch.id));
    const handles = [
      await DBOS.triggerSchedule(sweepSchedule),
      await DBOS.triggerSchedule(sweepSchedule),
    ];
    await Promise.all(handles.map((h) => h.getResult()));
    await eventually(read, (d) => d.monitor.checks === 2);
    await new Promise((r) => setTimeout(r, 500));
    expect((await read()).monitor.checks).toBe(2);

    // A check for a slot that is no longer current (paused, re-checked) changes nothing.
    expect(
      await recordCheck(server.ctx, userId, watch.id, due.toISOString(), {
        url: "demo://price",
        title: "",
        text: "different",
      }),
    ).toBeNull();
    await server.json(`/api/monitors/${watch.id}/control`, { token, body: { action: "pause" } });
    expect((await read()).monitor).toMatchObject({ status: "paused", nextCheckAt: null });
  });

  it("validates sources", async () => {
    const { token } = await server.signUp();
    for (const url of ["file:///etc/passwd", "demo://nope", "https://user:pw@example.com/"]) {
      const response = await server.call("/api/monitors", {
        token,
        body: { title: "Bad", url, condition: "change" },
      });
      expect(response.status, url).toBe(422);
    }
    await server.json(
      "/api/monitors",
      {
        token,
        body: { title: "No price", url: "demo://price", condition: "price_below", value: "0" },
      },
      422,
    );
  });

  it("finds prices in many formats", () => {
    const text =
      "Was $1,299.99, now US$ 999. Also €1.049,50 or 45 EUR; £12; ₹2,499; C$30. Save $200! Free shipping over $35, $5 off.";
    expect(findPrices(text, null).map((p) => `${p.currency} ${p.amount}`)).toEqual([
      "USD 1299.99",
      "USD 999",
      "EUR 1049.5",
      "EUR 45",
      "GBP 12",
      "INR 2499",
      "CAD 30",
    ]);
    expect(findPrices(text, "EUR").map((p) => p.amount)).toEqual([1049.5, 45]);
    expect(findPrices("Model 2026, 4 cores, 16 GB", null)).toEqual([]);
  });
});

describe("finance", () => {
  it("imports transactions and turns a report into a savings goal", async () => {
    const { token } = await server.signUp();
    const report = await server.json("/api/finance/sample", { token, body: {} }, 201);
    expect(report).toMatchObject({ name: "Example transactions", convention: "expenses_positive" });
    expect(report.income).toBeGreaterThan(report.spending);
    expect(report.categories[0].name).toBe("Housing");
    expect(report.recurring.map((r: { merchant: string }) => r.merchant)).toEqual(
      expect.arrayContaining(["Netflix.com", "Spotify", "Planet Fitness", "Comcast Internet"]),
    );
    const detail = await server.json(`/api/finance/${report.id}`, { token });
    expect(detail.transactions).toHaveLength(report.count);
    expect(detail.transactions[0].date >= detail.transactions.at(-1).date).toBe(true);

    const saved = await server.json(
      `/api/finance/${report.id}/goal`,
      { token, body: { monthlyTarget: 500 } },
      201,
    );
    expect(saved.created).toBe(true);
    const again = await server.json(
      `/api/finance/${report.id}/goal`,
      { token, body: { monthlyTarget: 500 } },
      201,
    );
    expect(again).toEqual({ goalId: saved.goalId, created: false });
    const { goal } = await server.json(`/api/goals/${saved.goalId}`, { token });
    expect(goal).toMatchObject({ title: "Save 500 a month", category: "Money" });
    expect(goal.milestones).toHaveLength(4);

    const other = await server.signUp();
    await server.json(`/api/finance/${report.id}`, { token: other.token }, 404);

    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    const events = await server.run(token, thread.id, "How much did I spend on dining?");
    expect(toolNames(events)).toEqual(["finance_summary"]);
    expect(replyText(events)).toMatch(
      /You spent \*\*\d+\.\d{2}\*\* on dining across \d+ transactions/,
    );
  });

  it("reads real-world CSV exports and explains bad ones", async () => {
    const { token } = await server.signUp();
    const bank = [
      "Posted Date;Payee;Debit;Credit;Currency",
      "24.09.2026;REWE Markt 1234;45,20;;EUR",
      "23.09.2026;Gehalt September;;3.200,00;EUR",
      '"20.09.2026";"Café ""Zum Hafen""";12,50;;EUR',
    ].join("\r\n");
    const report = await server.json(
      "/api/finance/import",
      { token, body: { name: "Girokonto", csv: `﻿${bank}` } },
      201,
    );
    expect(report).toMatchObject({
      currency: "EUR",
      convention: "debit_credit",
      income: 3200,
      spending: 57.7,
      period: { from: "2026-09-20", to: "2026-09-24" },
    });
    const bad = await server.json(
      "/api/finance/import",
      { token, body: { csv: "when,what\n1,2\n" } },
      422,
    );
    expect(bad.error).toContain("date, a description, and an amount");

    // Bank style: negative amounts are spending.
    const { summary } = analyzeTransactions(
      "Date,Description,Amount\n2026-09-01,Coffee,-4.50\n2026-09-02,Lunch,-12.00\n2026-09-03,Refund,3.00\n",
    );
    expect(summary).toMatchObject({ convention: "expenses_negative", spending: 16.5, income: 3 });
    expect(
      analyzeTransactions("Date,Description,Amount\n01/31/2026,x,1\n").transactions[0]?.date,
    ).toBe("2026-01-31");
    expect(
      analyzeTransactions("Date,Description,Amount\n31/01/2026,x,1\n").transactions[0]?.date,
    ).toBe("2026-01-31");
  });
});

describe("ideas", () => {
  it("suggests work from mail, calendar, goals and spending, with evidence", async () => {
    const { token } = await server.signUp();
    await server.json("/api/goals", { token, body: { title: "Get fit" } }, 201);
    await server.json("/api/finance/sample", { token, body: {} }, 201);
    const ideas = await server.json("/api/ideas?refresh=1", { token });
    const byKind = Object.fromEntries(ideas.map((i: { kind: string }) => [i.kind, i]));
    expect(Object.keys(byKind).sort()).toEqual(["finance", "paperwork", "plan", "reply"]);
    expect(byKind.paperwork).toMatchObject({
      title: "Fill in “Permission slip.pdf”",
      status: "new",
    });
    expect(byKind.paperwork.evidence[0]).toMatchObject({ kind: "mail", id: "demo-t1" });
    expect(byKind.reply.title).toBe("Reply to Sam");
    expect(byKind.reply.reason).toMatch(/calendar/);
    expect(byKind.plan.title).toBe("Plan “Get fit”");
    expect(byKind.finance.title).toMatch(/^Review \d+ recurring charges$/);

    // Dismissed ideas stay dismissed.
    await server.json(`/api/ideas/${byKind.finance.id}/decide`, {
      token,
      body: { action: "dismiss" },
    });
    const again = await server.json("/api/ideas?refresh=1", { token });
    expect(again.map((i: { kind: string }) => i.kind).sort()).toEqual([
      "paperwork",
      "plan",
      "reply",
    ]);

    // Accepting twice starts one task; the plan task fills the goal and retires nothing else.
    const [a, b] = await Promise.all([
      server.json(`/api/ideas/${byKind.plan.id}/decide`, { token, body: { action: "accept" } }),
      server.json(`/api/ideas/${byKind.plan.id}/decide`, { token, body: { action: "accept" } }),
    ]);
    expect(a.task.id).toBe(b.task.id);
    expect(a.idea).toMatchObject({ status: "accepted", taskId: a.task.id });
    await server.json(
      `/api/ideas/${byKind.plan.id}/decide`,
      { token, body: { action: "dismiss" } },
      409,
    );
    await server.waitForTask(token, a.task.id, ["succeeded"]);
    expect(
      (await server.json("/api/tasks", { token })).filter(
        (t: { id: string }) => t.id === a.task.id,
      ),
    ).toHaveLength(1);
  });

  it("carries an accepted reply idea through the owner's answer and approval", async () => {
    const { token } = await server.signUp();
    const ideas = await server.json("/api/ideas", { token });
    const reply = must(
      ideas.find((i: { kind: string }) => i.kind === "reply"),
      "reply idea",
    );
    const { task } = await server.json(`/api/ideas/${reply.id}/decide`, {
      token,
      body: { action: "accept", prompt: `${reply.prompt} Keep it short.` },
    });
    expect(task.prompt).toContain("Keep it short.");
    let detail = await server.waitForTask(token, task.id, ["waiting_input"]);
    expect(detail.task.question).toContain("What should I tell Sam");
    await server.json(`/api/tasks/${task.id}/answer`, { token, body: { answer: "Count me in!" } });
    detail = await server.waitForTask(token, task.id, ["waiting_approval"]);
    expect(detail.action.payload).toMatchObject({
      to: ["sam@friends.example"],
      body: "Count me in!",
      replyTo: { threadId: "demo-t2" },
    });
    await server.json(`/api/actions/${detail.action.id}/decide`, {
      token,
      body: { hash: detail.action.hash, decision: "approve" },
    });
    detail = await server.waitForTask(token, task.id, ["succeeded"]);
    expect(detail.task.result).toBe("Replied to Sam: “Count me in!”.");
  });

  it("retires a suggestion once it has been handled elsewhere", async () => {
    const { token } = await server.signUp();
    const before = await server.json("/api/ideas", { token });
    expect(before.some((i: { kind: string }) => i.kind === "reply")).toBe(true);
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    const events = await server.run(token, thread.id, "Reply to Sam: sounds great!");
    const result = JSON.parse(
      (
        events.filter((e) => e.type === EventType.TOOL_CALL_RESULT).at(-1) as unknown as {
          content: string;
        }
      ).content,
    );
    const action = await server.json(`/api/actions/${result.actionId}`, { token });
    await server.json(`/api/actions/${action.id}/decide`, {
      token,
      body: { hash: action.hash, decision: "approve" },
    });
    const after = await server.json("/api/ideas?refresh=1", { token });
    expect(after.map((i: { kind: string }) => i.kind)).toEqual(["paperwork"]);
  });
});

describe("chat", () => {
  it("creates goals and watches, and reports on them", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    let events = await server.run(token, thread.id, "Set a goal to run a half marathon");
    expect(toolNames(events)).toEqual(["create_goal"]);
    expect(replyText(events)).toContain("Run a half marathon");
    events = await server.run(
      token,
      thread.id,
      "Watch demo://price and tell me when it's below $300, every 2 hours",
    );
    expect(toolNames(events)).toEqual(["watch_page"]);
    const [watch] = await server.json("/api/monitors", { token });
    expect(watch).toMatchObject({
      url: "demo://price",
      condition: "price_below",
      value: "300",
      intervalMinutes: 120,
    });
    events = await server.run(token, thread.id, "How are my goals?");
    expect(toolNames(events)).toEqual(["goal_status"]);
    expect(replyText(events)).toContain("**Run a half marathon** — 0/0 milestones");
    expect(replyText(events)).toContain("Price on demo://price");
  });
});
