import type { BaseEvent } from "@ag-ui/core";
import { readSse } from "@agent-v/shared";
import type { LanguageModel } from "ai";
import pg from "pg";
import { expect } from "vitest";
import { type Config, readConfig } from "../src/config.ts";
import { createModels, type Models } from "../src/models/registry.ts";
import { startRuntime } from "../src/runtime.ts";

export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://agentv:agentv@127.0.0.1:5432/agentv_test";

export function testConfig(overrides: Record<string, string> = {}): Config {
  return readConfig({
    NODE_ENV: "test",
    DATABASE_URL: testDatabaseUrl,
    BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
    PUBLIC_URL: "http://localhost:8787",
    ALLOW_PRIVATE_NETWORK_FETCH: "true",
    ...overrides,
  });
}

/** Drop everything so each test file starts from a fresh schema. */
export async function resetDatabase() {
  const client = new pg.Client({ connectionString: testDatabaseUrl });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS dbos CASCADE;");
  await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await client.end();
}

/** Real models plus scripted ones registered under extra ids. */
export function withModels(config: Config, extra: Record<string, () => LanguageModel>): Models {
  const base = createModels(config);
  return {
    defaultModel: base.defaultModel,
    isAllowed: (id) => id in extra || base.isAllowed(id),
    options: () => [...base.options(), ...Object.keys(extra).map((id) => ({ id, label: id }))],
    resolve: (id) => extra[id]?.() ?? base.resolve(id),
  };
}

export type TestServer = Awaited<ReturnType<typeof startTestServer>>;

export async function startTestServer(
  options: { config?: Record<string, string>; models?: Record<string, () => LanguageModel> } = {},
) {
  await resetDatabase();
  const config = testConfig(options.config);
  const runtime = await startRuntime(config, {
    models: options.models ? withModels(config, options.models) : undefined,
  });
  let userCount = 0;

  async function call(
    path: string,
    init: { token?: string; method?: string; body?: unknown; signal?: AbortSignal } = {},
  ) {
    return runtime.app.fetch(
      new Request(`http://localhost:8787${path}`, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: {
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: init.signal,
      }),
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: test responses are asserted field by field
  async function json<T = any>(path: string, init: Parameters<typeof call>[1] = {}, status = 200) {
    const response = await call(path, init);
    const text = await response.text();
    expect(response.status, text).toBe(status);
    return (text ? JSON.parse(text) : null) as T;
  }

  async function signUp(name = `User ${++userCount}`) {
    const response = await call("/api/auth/sign-up/email", {
      body: {
        name,
        email: `${name.replace(/\W/g, "").toLowerCase()}@example.com`,
        password: "a-long-password-1",
      },
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const token = response.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    const body = (await response.json()) as { user: { id: string } };
    return { token: token as string, userId: body.user.id };
  }

  async function run(token: string, threadId: string, content: string, model?: string) {
    const response = await call(`/api/threads/${threadId}/runs`, {
      token,
      body: { content, ...(model ? { model } : {}) },
    });
    expect(response.status, response.status === 200 ? "" : await response.clone().text()).toBe(200);
    const events: BaseEvent[] = [];
    for await (const message of readSse(response.body as ReadableStream<Uint8Array>))
      events.push(JSON.parse(message.data));
    return events;
  }

  async function waitForTask(token: string, id: string, statuses: string[], timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const detail = await json(`/api/tasks/${id}`, { token });
      if (statuses.includes(detail.task.status)) return detail;
      if (Date.now() > deadline)
        throw new Error(
          `Task stayed ${detail.task.status}; events: ${JSON.stringify(detail.events)}`,
        );
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return { ...runtime, config, call, json, signUp, run, waitForTask };
}
