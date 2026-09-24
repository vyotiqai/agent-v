import { EventType } from "@ag-ui/core";
import { readSse } from "@agent-v/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./helpers.ts";

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server?.close();
});

describe("auth", () => {
  it("rejects requests without a session", async () => {
    const response = await server.call("/api/threads");
    expect(response.status).toBe(401);
  });

  it("signs up, signs in and returns the profile with models", async () => {
    await server.signUp("Grace");
    const response = await server.call("/api/auth/sign-in/email", {
      body: { email: "grace@example.com", password: "a-long-password-1" },
    });
    expect(response.status).toBe(200);
    const token = response.headers.get("set-auth-token") as string;
    const me = await server.json("/api/me", { token });
    expect(me.user.email).toBe("grace@example.com");
    expect(me.settings.model).toBe("demo/agent-v");
    expect(me.models.map((m: { id: string }) => m.id)).toContain("demo/agent-v");
  });
});

describe("threads", () => {
  it("keeps each user's chats private", async () => {
    const a = await server.signUp();
    const b = await server.signUp();
    const thread = await server.json("/api/threads", { token: a.token, body: {} }, 201);
    expect(thread.title).toBe("New chat");
    await server.json(`/api/threads/${thread.id}/messages`, { token: b.token }, 404);
    await server.json(
      `/api/threads/${thread.id}`,
      { token: b.token, method: "PATCH", body: { title: "x" } },
      404,
    );
    const listB = await server.json("/api/threads", { token: b.token });
    expect(listB).toEqual([]);
    const renamed = await server.json(`/api/threads/${thread.id}`, {
      token: a.token,
      method: "PATCH",
      body: { title: "Trip ideas", archived: true },
    });
    expect(renamed).toMatchObject({ title: "Trip ideas", archived: true });
  });
});

describe("chat runs", () => {
  it("streams AG-UI events, calls tools and stores the conversation", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    const events = await server.run(token, thread.id, "Remember that I prefer window seats");
    const types = events.map((e) => e.type);
    expect(types[0]).toBe(EventType.RUN_STARTED);
    expect(types.at(-1)).toBe(EventType.RUN_FINISHED);
    expect(types).toContain(EventType.TOOL_CALL_START);
    expect(types).toContain(EventType.TOOL_CALL_RESULT);
    expect(types).toContain(EventType.TEXT_MESSAGE_CONTENT);
    const start = events.find((e) => e.type === EventType.TOOL_CALL_START) as unknown as {
      toolCallName: string;
    };
    expect(start.toolCallName).toBe("remember_fact");

    const memories = await server.json("/api/memories", { token });
    expect(memories.map((m: { text: string }) => m.text)).toEqual(["I prefer window seats"]);

    const messages = await server.json(`/api/threads/${thread.id}/messages`, { token });
    expect(messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(messages[1].toolCalls[0].function.name).toBe("remember_fact");
    expect(messages[3].content).toContain("remember");

    const [listed] = await server.json("/api/threads", { token });
    expect(listed.title).toBe("Remember that I prefer window seats");

    // The next run replays the stored history through the model without errors.
    const again = await server.run(token, thread.id, "hello");
    expect(again.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  it("refuses models that are not enabled", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    const response = await server.call(`/api/threads/${thread.id}/runs`, {
      token,
      body: { content: "hi", model: "openai/not-configured" },
    });
    expect(response.status).toBe(422);
  });
});

describe("settings, memory and live events", () => {
  it("pushes workspace changes over SSE", async () => {
    const { token } = await server.signUp();
    const controller = new AbortController();
    const response = await server.call("/api/events", { token, signal: controller.signal });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const received: string[] = [];
    const reading = (async () => {
      for await (const message of readSse(
        response.body as ReadableStream<Uint8Array>,
        controller.signal,
      )) {
        received.push(`${message.event}:${message.data}`);
        if (message.event === "change") controller.abort();
      }
    })().catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    const memory = await server.json("/api/memories", { token, body: { text: "Vegetarian" } }, 201);
    await reading;
    expect(received[0]).toBe("ready:{}");
    expect(received[1]).toBe(`change:${JSON.stringify({ type: "memory", id: memory.id })}`);

    await server.json(`/api/memories/${memory.id}`, { token, method: "DELETE" }, 204);
    expect(await server.json("/api/memories", { token })).toEqual([]);
  });

  it("validates settings", async () => {
    const { token } = await server.signUp();
    await server.json(
      "/api/settings",
      { token, method: "PATCH", body: { model: "nope/nope" } },
      422,
    );
    const settings = await server.json("/api/settings", {
      token,
      method: "PATCH",
      body: { agentName: "Muse", tone: "playful" },
    });
    expect(settings).toMatchObject({ agentName: "Muse", tone: "playful", model: "demo/agent-v" });
  });
});
