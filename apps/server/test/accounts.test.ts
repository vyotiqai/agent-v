import { existsSync } from "node:fs";
import { join } from "node:path";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { eq, sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usageCounters, user } from "../src/db/schema.ts";
import { permissionSlipPdf } from "../src/providers/demo.ts";
import { MemoryStore, PostgresStore } from "../src/ratelimit.ts";
import { startTestServer, TestMailer, type TestServer } from "./helpers.ts";

const plans = JSON.stringify([
  {
    id: "tiny",
    name: "Tiny",
    limits: {
      tokens: 2500,
      tasks: 1,
      browserActions: 0,
      computerMinutes: 0,
      voiceMinutes: 0,
      storageMb: 1,
      connectors: 1,
      watches: 1,
    },
  },
  {
    id: "big",
    name: "Big",
    limits: {
      tokens: null,
      tasks: null,
      browserActions: null,
      computerMinutes: null,
      voiceMinutes: null,
      storageMb: null,
      connectors: null,
      watches: null,
    },
  },
]);

const mailer = new TestMailer();
let server: TestServer;
beforeAll(async () => {
  server = await startTestServer({
    mailer,
    config: { PLANS: plans, ADMIN_EMAILS: "ops@example.com", APP_URL: "http://app.test" },
  });
});
afterAll(async () => {
  await server?.close();
});

describe("plans and quotas", () => {
  it("meters tokens per model and stops chat at the monthly allowance", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    await server.run(token, thread.id, "Hello there, what can you do for me today?");
    const usage = await server.json("/api/usage", { token });
    expect(usage.plan.id).toBe("tiny");
    expect(usage.enforced).toBe(true);
    expect(usage.used.tokens).toBeGreaterThan(0);
    expect(usage.models[0]).toMatchObject({ model: "demo/agent-v" });
    expect(usage.models[0].input + usage.models[0].output).toBe(usage.used.tokens);

    // Use up the allowance: the next turn is refused before anything is saved.
    await server.ctx.db
      .update(usageCounters)
      .set({ amount: 2500 })
      .where(eq(usageCounters.metric, "tokens"));
    const refused = await server.call(`/api/threads/${thread.id}/runs`, {
      token,
      body: { content: "One more?" },
    });
    expect(refused.status).toBe(402);
    expect(((await refused.json()) as { error: string }).error).toMatch(
      /this month's AI allowance on the Tiny plan/,
    );
    const messages = await server.json(`/api/threads/${thread.id}/messages`, { token });
    expect(messages.some((m: { content: string }) => m.content === "One more?")).toBe(false);
  });

  it("still counts a reply the person cut short", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    const controller = new AbortController();
    const response = await server.call(`/api/threads/${thread.id}/runs`, {
      token,
      body: { content: "Tell me everything you can do, in detail" },
      signal: controller.signal,
    });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    controller.abort();
    await reader.cancel().catch(() => {});
    let used = 0;
    for (let i = 0; i < 40 && !used; i++) {
      await new Promise((r) => setTimeout(r, 100));
      used = (await server.json("/api/usage", { token })).used.tokens;
    }
    expect(used).toBeGreaterThan(0);
  });

  it("counts tasks, watches, connectors and storage against the plan", async () => {
    const { token } = await server.signUp();
    await server.json("/api/tasks", { token, body: { prompt: "Say hello" } }, 201);
    const second = await server.call("/api/tasks", { token, body: { prompt: "Again" } });
    expect(second.status).toBe(402);

    const watch = { title: "Price", url: "demo://price", condition: "change" };
    await server.json("/api/monitors", { token, body: watch }, 201);
    const extra = await server.call("/api/monitors", { token, body: watch });
    expect(extra.status).toBe(402);
    expect(((await extra.json()) as { error: string }).error).toMatch(/watch limit/);

    const usage = await server.json("/api/usage", { token });
    expect(usage.used).toMatchObject({ tasks: 1, watches: 1, connectors: 0 });
  });

  it("an operator's grant lifts the limits", async () => {
    const ops = await server.signUp("Ops");
    const person = await server.signUp();
    const list = await server.json("/api/admin/users?search=user", { token: ops.token });
    const target = list.users.find((u: { id: string }) => u.id === person.userId);
    expect(target).toMatchObject({ plan: "tiny", planSource: "default", banned: false });
    await server.json(`/api/admin/users/${person.userId}`, {
      token: ops.token,
      method: "PATCH",
      body: { plan: "big" },
    });
    const usage = await server.json("/api/usage", { token: person.token });
    expect(usage).toMatchObject({ plan: { id: "big" }, source: "granted" });
    await server.json("/api/tasks", { token: person.token, body: { prompt: "One" } }, 201);
    await server.json("/api/tasks", { token: person.token, body: { prompt: "Two" } }, 201);

    // Only operators reach the admin API, and it never shows content.
    expect((await server.call("/api/admin/users", { token: person.token })).status).toBe(404);
    const me = await server.json("/api/me", { token: ops.token });
    expect(me.features.admin).toBe(true);
    expect(me.user.role).toBe("admin");
  });

  it("suspending an account ends its sessions and blocks sign-in", async () => {
    const ops = (await server.json("/api/auth/sign-in/email", {
      body: { email: "ops@example.com", password: "a-long-password-1" },
    })) as { token: string };
    const person = await server.signUp();
    await server.json(`/api/admin/users/${person.userId}`, {
      token: ops.token,
      method: "PATCH",
      body: { banned: true, banReason: "Spam" },
    });
    expect((await server.call("/api/threads", { token: person.token })).status).toBe(401);
    const again = await server.call("/api/auth/sign-in/email", {
      body: { email: person.email, password: "a-long-password-1" },
    });
    expect(again.status).toBe(403);
    await server.json(`/api/admin/users/${person.userId}`, {
      token: ops.token,
      method: "PATCH",
      body: { banned: false },
    });
    const back = await server.call("/api/auth/sign-in/email", {
      body: { email: person.email, password: "a-long-password-1" },
    });
    expect(back.status).toBe(200);
    // Operators cannot impersonate or use Better Auth's admin endpoints directly.
    expect(
      (
        await server.call("/api/auth/admin/impersonate-user", {
          token: ops.token,
          body: { userId: person.userId },
        })
      ).status,
    ).toBe(404);
  });
});

describe("rate limits", () => {
  for (const [name, make] of [
    ["memory", () => new MemoryStore()],
    ["postgres", () => new PostgresStore(server.ctx)],
  ] as const)
    it(`counts per key and window (${name})`, async () => {
      const store = make();
      const key = `test:${name}:${Date.now()}`;
      expect((await store.hit(key, 1000)).count).toBe(1);
      expect((await store.hit(key, 1000)).count).toBe(2);
      const other = await store.hit(`${key}:other`, 1000);
      expect(other.count).toBe(1);
      await new Promise((r) => setTimeout(r, 1100));
      const fresh = await store.hit(key, 1000);
      expect(fresh.count).toBe(1);
      expect(fresh.resetAt).toBeGreaterThan(Date.now());
    });
});

describe("account emails", () => {
  it("verifies email on sign-up and resets a forgotten password", async () => {
    const { email } = await server.signUp("Reset Me");
    const verify = mailer.last(email, /Confirm your email/);
    expect(verify?.action?.url).toContain("/api/auth/verify-email?token=");
    // Emailed links land in the app.
    expect(new URL(verify?.action?.url ?? "").searchParams.get("callbackURL")).toBe(
      "http://app.test/settings?verified=1",
    );
    const confirmed = await server.call(
      verify?.action?.url.replace("http://localhost:8787", "") ?? "",
    );
    expect(confirmed.status).toBeLessThan(400);
    const [row] = await server.ctx.db.select().from(user).where(eq(user.email, email));
    expect(row?.emailVerified).toBe(true);

    await server.json("/api/auth/request-password-reset", { body: { email } });
    const reset = mailer.last(email, /Reset your Agent V password/);
    const link = new URL(reset?.action?.url ?? "");
    const redirect = await server.call(`${link.pathname}${link.search}`);
    expect(redirect.status).toBe(302);
    const target = new URL(redirect.headers.get("location") ?? "");
    expect(target.origin + target.pathname).toBe("http://app.test/reset-password");
    const tokenParam = target.searchParams.get("token");
    expect(tokenParam).toBeTruthy();
    await server.json("/api/auth/reset-password", {
      body: { token: tokenParam, newPassword: "a-brand-new-password" },
    });
    expect(
      (
        await server.call("/api/auth/sign-in/email", {
          body: { email, password: "a-long-password-1" },
        })
      ).status,
    ).toBe(401);
    await server.json("/api/auth/sign-in/email", {
      body: { email, password: "a-brand-new-password" },
    });
  });
});

describe("your data", () => {
  it("exports everything readable, without secrets", async () => {
    const { token } = await server.signUp("Exporter");
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    await server.run(token, thread.id, "Remember that I like green tea");
    await server.json("/api/memories", { token, body: { text: "Likes green tea" } }, 201);
    await server.json(
      "/api/connectors",
      {
        token,
        body: {
          name: "Private",
          url: "http://127.0.0.1:9/mcp",
          auth: "bearer",
          token: "sk-secret-123",
        },
      },
      201,
    );
    // Phones and the desktop app download through a short-lived signed link.
    const { url } = await server.json("/api/account/export-link", { token, body: {} });
    const link = new URL(url);
    expect(link.pathname).toBe("/api/account/export/download");
    const signed = await server.call(`${link.pathname}${link.search}`);
    expect(signed.status).toBe(200);
    expect(unzipSync(new Uint8Array(await signed.arrayBuffer()))["README.txt"]).toBeTruthy();
    const tampered = link.search.replace(/s=[^&]+/, "s=forged");
    expect((await server.call(`${link.pathname}${tampered}`)).status).toBe(401);

    const response = await server.call("/api/account/export", { token });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toMatch(/agent-v-export-.*\.zip/);
    const zip = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(zip)).toEqual(
      expect.arrayContaining([
        "README.txt",
        "account.json",
        "chats.json",
        "memories.json",
        "files.json",
      ]),
    );
    const chats = JSON.parse(strFromU8(zip["chats.json"] as Uint8Array));
    expect(chats[0].messages[0].content).toBe("Remember that I like green tea");
    const everything = Object.values(zip)
      .map((b) => strFromU8(b))
      .join("\n");
    expect(everything).toContain("Likes green tea");
    expect(everything).not.toContain("sk-secret-123");
    expect(everything).not.toMatch(/"embedding"/);
    const account = JSON.parse(strFromU8(zip["account.json"] as Uint8Array));
    expect(account.profile.name).toBe("Exporter");
    expect(account.usage.length).toBeGreaterThan(0);
  });

  it("deletes the account and everything it owns, after the password", async () => {
    const { token, userId } = await server.signUp("Leaving");
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    await server.run(token, thread.id, "I'm vegetarian. Hello!");
    const task = await server.json("/api/tasks", { token, body: { prompt: "Say hi" } }, 201);
    await server.waitForTask(token, task.id, ["succeeded", "failed"]);
    const form = new FormData();
    form.set("file", new File([await permissionSlipPdf()], "slip.pdf"));
    const upload = await server.app.fetch(
      new Request("http://localhost:8787/api/files", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      }),
    );
    expect(upload.status).toBe(201);
    const filesDir = join(server.config.dataDir, "files", userId);
    expect(existsSync(filesDir)).toBe(true);

    const wrong = await server.call("/api/account/delete", {
      token,
      body: { password: "not-my-password" },
    });
    expect(wrong.status).toBe(400);
    expect((await DBOS.listWorkflows({ authenticatedUser: userId })).length).toBeGreaterThan(0);

    // Better Auth's own endpoint is closed: deletion always goes through the password check.
    expect((await server.call("/api/auth/delete-user", { token, body: {} })).status).toBe(404);

    await server.json("/api/account/delete", { token, body: { password: "a-long-password-1" } });
    expect((await server.call("/api/threads", { token })).status).toBe(401);
    const [left] = await server.ctx.db.select().from(user).where(eq(user.id, userId));
    expect(left).toBeUndefined();
    for (const table of ["threads", "messages", "tasks", "memories", "usage_counters"]) {
      const { rows } = await server.ctx.db.execute(
        sql`select count(*)::int as n from ${sql.identifier(table)} where user_id = ${userId}`,
      );
      expect(rows[0], table).toEqual({ n: 0 });
    }
    expect(await DBOS.listWorkflows({ authenticatedUser: userId })).toEqual([]);
    expect(await DBOS.listWorkflows({ workflowIDs: [task.id] })).toEqual([]);
    expect(existsSync(filesDir)).toBe(false);
  });
});
