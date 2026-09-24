import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { EventType } from "@ag-ui/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DemoModel } from "../src/models/demo.ts";
import { startTestServer, type TestServer } from "./helpers.ts";

let server: TestServer;
let hook: Server;
let hookUrl: string;
const received: unknown[] = [];
let flaky = 0;

beforeAll(async () => {
  hook = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      // The demo model reads the URL (GET) before proposing the POST; only POSTs are writes.
      if (req.method === "POST") received.push(JSON.parse(body || "null"));
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => hook.listen(0, "127.0.0.1", resolve));
  hookUrl = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/hook`;
  server = await startTestServer({
    models: {
      // Fails its first three calls (all step retries), then behaves like the demo model.
      "flaky/model": () => {
        if (flaky++ < 3) throw new Error("provider unavailable");
        return new DemoModel("flaky");
      },
    },
  });
});
afterAll(async () => {
  await server?.close();
  await new Promise((resolve) => hook?.close(resolve));
});

describe("durable tasks", () => {
  it("delegates from chat and finishes in the background", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    const events = await server.run(token, thread.id, "Plan a weekend trip to Lisbon");
    const result = events.find((e) => e.type === EventType.TOOL_CALL_RESULT) as unknown as {
      content: string;
    };
    const { id } = JSON.parse(result.content);
    const detail = await server.waitForTask(token, id, ["succeeded"]);
    expect(detail.task.threadId).toBe(thread.id);
    expect(detail.task.plan.map((s: { status: string }) => s.status)).toEqual([
      "done",
      "done",
      "done",
    ]);
    expect(detail.task.result).toContain("Plan a weekend trip to Lisbon");
    expect(detail.events.map((e: { title: string }) => e.title)).toEqual(
      expect.arrayContaining(["Queued", "Started working", "Made a plan", "Finished"]),
    );
    const notifications = await server.json("/api/notifications", { token });
    expect(notifications[0].title).toBe("Done: Plan a weekend trip to Lisbon");
  });

  it("waits for the owner's answer, survives cancel and resume, then finishes", async () => {
    const { token } = await server.signUp();
    const created = await server.json(
      "/api/tasks",
      { token, body: { prompt: "Choose a restaurant and ask me first about the budget" } },
      201,
    );
    let detail = await server.waitForTask(token, created.id, ["waiting_input"]);
    expect(detail.task.question).toBe("What detail should I use to finish this?");

    await server.json(`/api/tasks/${created.id}/control`, { token, body: { action: "cancel" } });
    await server.json(`/api/tasks/${created.id}/answer`, { token, body: { answer: "x" } }, 409);
    await server.json(`/api/tasks/${created.id}/control`, { token, body: { action: "retry" } });
    detail = await server.waitForTask(token, created.id, ["waiting_input"]);

    await server.json(`/api/tasks/${created.id}/answer`, { token, body: { answer: "Under $60" } });
    detail = await server.waitForTask(token, created.id, ["succeeded"]);
    expect(detail.task.result).toContain("Under $60");
  });

  it("executes an external write only after approval of the exact payload", async () => {
    const { token } = await server.signUp();
    const other = await server.signUp();
    const created = await server.json(
      "/api/tasks",
      { token, body: { prompt: `Post to ${hookUrl} a webhook with my update` } },
      201,
    );
    const detail = await server.waitForTask(token, created.id, ["waiting_approval"]);
    const action = detail.action;
    expect(action).toMatchObject({ kind: "webhook.post", status: "awaiting_review" });
    expect(received).toEqual([]);

    await server.json(
      `/api/actions/${action.id}/decide`,
      { token: other.token, body: { hash: action.hash, decision: "approve" } },
      404,
    );
    await server.json(
      `/api/actions/${action.id}/decide`,
      { token, body: { hash: "0".repeat(64), decision: "approve" } },
      409,
    );
    await server.json(`/api/actions/${action.id}/decide`, {
      token,
      body: { hash: action.hash, decision: "approve" },
    });
    const done = await server.waitForTask(token, created.id, ["succeeded"]);
    expect(done.task.actionId).toBeNull();
    expect(received).toEqual([action.payload.body]);
    await server.json(
      `/api/actions/${action.id}/decide`,
      { token, body: { hash: action.hash, decision: "approve" } },
      409,
    );
  });

  it("does not send when the owner declines", async () => {
    const { token } = await server.signUp();
    const before = received.length;
    const created = await server.json(
      "/api/tasks",
      { token, body: { prompt: `Post to ${hookUrl} a webhook please` } },
      201,
    );
    const { action } = await server.waitForTask(token, created.id, ["waiting_approval"]);
    const denied = await server.json(`/api/actions/${action.id}/decide`, {
      token,
      body: { hash: action.hash, decision: "deny" },
    });
    expect(denied.status).toBe("denied");
    const done = await server.waitForTask(token, created.id, ["succeeded"]);
    expect(done.events.map((e: { title: string }) => e.title)).toContain("Action denied");
    expect(received.length).toBe(before);
  });

  it("retries a failed task from its failed step", async () => {
    const { token } = await server.signUp();
    await server.json("/api/settings", { token, method: "PATCH", body: { model: "flaky/model" } });
    const created = await server.json(
      "/api/tasks",
      { token, body: { prompt: "Organize my week" } },
      201,
    );
    const failed = await server.waitForTask(token, created.id, ["failed"], 30_000);
    expect(failed.task.error).toContain("provider unavailable");
    await server.json(`/api/tasks/${created.id}/control`, { token, body: { action: "retry" } });
    const done = await server.waitForTask(token, created.id, ["succeeded"]);
    expect(done.task.error).toBeNull();
  });

  it("keeps tasks private", async () => {
    const a = await server.signUp();
    const b = await server.signUp();
    const created = await server.json(
      "/api/tasks",
      { token: a.token, body: { prompt: "Research tea" } },
      201,
    );
    await server.json(`/api/tasks/${created.id}`, { token: b.token }, 404);
    await server.json(
      `/api/tasks/${created.id}/control`,
      { token: b.token, body: { action: "cancel" } },
      404,
    );
    expect(await server.json("/api/tasks", { token: b.token })).toEqual([]);
  });
});
