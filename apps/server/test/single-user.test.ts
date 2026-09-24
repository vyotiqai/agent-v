import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { singleUserEmail } from "../src/single-user.ts";
import { resetDatabase, startTestServer, type TestServer } from "./helpers.ts";

let single: TestServer;
beforeAll(async () => {
  await resetDatabase();
  single = await startTestServer({
    config: { SINGLE_USER: "true", ALLOWED_ORIGINS: "http://localhost:8081,tauri://localhost" },
  });
});
afterAll(async () => {
  await single?.close();
});

const ask = (server: TestServer, headers: Record<string, string> = {}) =>
  server.app.fetch(
    new Request("http://localhost:8787/api/single-user/session", {
      method: "POST",
      headers: { host: "localhost:8787", ...headers },
    }),
  );

describe("single-user mode", () => {
  it("hands this computer's app a session for the one built-in account", async () => {
    const first = await ask(single, { origin: "tauri://localhost" });
    expect(first.status).toBe(200);
    const { token } = (await first.json()) as { token: string };
    const me = await single.json("/api/me", { token });
    expect(me.user.email).toBe(singleUserEmail);
    expect(me.features.singleUser).toBe(true);

    // Every later session belongs to the same account, and its data is there.
    await single.json("/api/threads", { token, body: { title: "Kept" } }, 201);
    const again = (await (await ask(single, { host: "127.0.0.1:8787" })).json()) as {
      token: string;
    };
    expect(again.token).not.toBe(token);
    const threads = await single.json("/api/threads", { token: again.token });
    expect(threads.map((t: { title: string }) => t.title)).toContain("Kept");
  });

  it("creates the account once even when asked many times at once", async () => {
    const tokens = await Promise.all(
      Array.from(
        { length: 5 },
        async () => ((await (await ask(single)).json()) as { token: string }).token,
      ),
    );
    const ids = await Promise.all(
      tokens.map(async (token) => (await single.json("/api/me", { token })).user.id),
    );
    expect(new Set(ids).size).toBe(1);
  });

  it("refuses other hosts, which also stops DNS rebinding and other machines", async () => {
    for (const host of ["evil.example:8787", "192.168.1.20:8787", "localhost.evil.example"])
      expect((await ask(single, { host })).status).toBe(403);
  });

  it("refuses web pages that aren't the app", async () => {
    expect((await ask(single, { origin: "https://evil.example" })).status).toBe(403);
    expect((await ask(single, { origin: "http://localhost:8081" })).status).toBe(200);
  });

  it("the built-in account has no password to sign in with", async () => {
    const response = await single.call("/api/auth/sign-in/email", {
      body: { email: singleUserEmail, password: "anything-at-all-123" },
    });
    expect(response.status).toBe(401);
  });

  it("doesn't exist unless switched on", async () => {
    single.config.singleUser = false;
    try {
      expect((await ask(single)).status).toBe(404);
      const { token } = await single.signUp();
      expect((await single.json("/api/me", { token })).features.singleUser).toBe(false);
    } finally {
      single.config.singleUser = true;
    }
  });
});
