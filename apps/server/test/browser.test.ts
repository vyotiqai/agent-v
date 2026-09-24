import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventType } from "@ag-ui/core";
import { serve } from "@hono/node-server";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createWorkerApp } from "../../browser/src/app.ts";
import { type EgressProxy, startEgressProxy } from "../../browser/src/proxy.ts";
import { Sessions } from "../../browser/src/sessions.ts";
import { permissionSlipPdf } from "../src/providers/demo.ts";
import { startTestServer, type TestServer } from "./helpers.ts";

// Use CHROMIUM_PATH, Playwright's own download, or a preinstalled Chromium; skip if none.
const chromiumPath =
  process.env.CHROMIUM_PATH ??
  [
    safely(() => chromium.executablePath()),
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ].find((p): p is string => Boolean(p && existsSync(p)));
function safely<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
const token = "w".repeat(40);

let site: Server;
let origin: string;
let dir: string;
let proxy: EgressProxy;
let sessions: Sessions;
let worker: ReturnType<typeof serve>;
let api: ReturnType<typeof serve>;
let apiBase: string;
let server: TestServer;

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
/** A model that browses, follows a link, then answers from what it read. */
function scriptedBrowser(url: string) {
  let turn = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = turn++ % 3;
      const chunks =
        step === 0
          ? [
              {
                type: "tool-call",
                toolCallId: `b${turn}`,
                toolName: "browse",
                input: JSON.stringify({ url }),
              },
            ]
          : step === 1
            ? [
                {
                  type: "tool-call",
                  toolCallId: `c${turn}`,
                  toolName: "click_link",
                  input: JSON.stringify({ name: "Next page" }),
                },
              ]
            : [
                { type: "text-start", id: "t" },
                { type: "text-delta", id: "t", delta: "Followed the link." },
                { type: "text-end", id: "t" },
              ];
      return {
        stream: simulateReadableStream({
          chunks: [
            ...chunks,
            {
              type: "finish",
              finishReason: { unified: step < 2 ? "tool-calls" : "stop", raw: undefined },
              usage,
            },
          ] as never[],
        }),
      };
    },
  });
}

beforeAll(async () => {
  if (!chromiumPath) return;
  const slip = Buffer.from(await permissionSlipPdf());
  site = createServer((req, res) => {
    if (req.url === "/slip.pdf")
      return res
        .writeHead(200, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="slip.pdf"',
        })
        .end(slip);
    const pages: Record<string, string> = {
      "/": `<title>Garden</title><p>Tomatoes need sun.</p><a href="/next">Next page</a>`,
      "/next": `<title>Watering</title><p>Water in the morning.</p>`,
    };
    const body = pages[req.url ?? ""];
    res.writeHead(body ? 200 : 404, { "content-type": "text/html" }).end(body ?? "missing");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;

  dir = await mkdtemp(join(tmpdir(), "agent-v-api-browser-"));
  proxy = await startEgressProxy({ allowPrivate: true });
  const workerConfig = {
    host: "127.0.0.1",
    port: 0,
    token,
    dataDir: dir,
    chromiumPath,
    maxActive: 3,
    idleMs: 60_000,
    allowPrivate: true,
  };
  sessions = new Sessions(workerConfig, proxy.url);
  const w = createWorkerApp(workerConfig, sessions);
  worker = serve({ fetch: w.app.fetch, port: 0, hostname: "127.0.0.1" });
  w.injectWebSocket(worker);
  await new Promise((r) => worker.once("listening", r));

  server = await startTestServer({
    config: {
      BROWSER_URL: `http://127.0.0.1:${(worker.address() as AddressInfo).port}`,
      BROWSER_TOKEN: token,
    },
    models: { "script/browser": () => scriptedBrowser(`${origin}/`) },
  });
  api = serve({ fetch: server.app.fetch, port: 0, hostname: "127.0.0.1" });
  server.injectWebSocket(api);
  await new Promise((r) => api.once("listening", r));
  apiBase = `127.0.0.1:${(api.address() as AddressInfo).port}`;
});

afterAll(async () => {
  api?.close();
  await server?.close();
  worker?.close();
  await sessions?.stop();
  await proxy?.close();
  site?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!chromiumPath)("cloud browser", () => {
  it("browses from chat in the chat's own session, private to its owner", async () => {
    const { token: a } = await server.signUp();
    const b = await server.signUp();
    const thread = await server.json("/api/threads", { token: a, body: {} }, 201);
    const events = await server.run(a, thread.id, `Summarize ${origin}/`);
    const start = events.find((e) => e.type === EventType.TOOL_CALL_START) as unknown as {
      toolCallName: string;
    };
    expect(start.toolCallName).toBe("browse");
    const result = events.find((e) => e.type === EventType.TOOL_CALL_RESULT) as unknown as {
      content: string;
    };
    const page = JSON.parse(result.content);
    expect(page).toMatchObject({ title: "Garden", url: `${origin}/` });
    expect(page.text).toContain("Tomatoes need sun.");

    const [session] = await server.json("/api/browsers", { token: a });
    expect(session).toMatchObject({ id: page.sessionId, threadId: thread.id, title: "Garden" });
    await server.json(`/api/browsers/${session.id}`, { token: b.token }, 404);
    expect(await server.json("/api/browsers", { token: b.token })).toEqual([]);

    // The same chat reuses its browser.
    await server.run(a, thread.id, `Summarize ${origin}/next`);
    const list = await server.json("/api/browsers", { token: a });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Watering");
  });

  it("follows links with a real model loop", async () => {
    const { token: a } = await server.signUp();
    await server.json("/api/settings", {
      token: a,
      method: "PATCH",
      body: { model: "script/browser" },
    });
    const thread = await server.json("/api/threads", { token: a, body: {} }, 201);
    const events = await server.run(a, thread.id, "Read the garden page and go to the next one");
    const names = events
      .filter((e) => e.type === EventType.TOOL_CALL_START)
      .map((e) => (e as unknown as { toolCallName: string }).toolCallName);
    expect(names).toEqual(["browse", "click_link"]);
    const results = events
      .filter((e) => e.type === EventType.TOOL_CALL_RESULT)
      .map((e) => JSON.parse((e as unknown as { content: string }).content));
    expect(results[1]).toMatchObject({ title: "Watering" });
    expect(results[1].text).toContain("Water in the morning.");
  });

  it("serves signed screenshots and a live view with take-control", async () => {
    const { token: a, userId } = await server.signUp();
    const opened = await server.json(
      "/api/browsers",
      { token: a, body: { url: `${origin}/` } },
      201,
    );
    const shot = await fetch(
      opened.screenshotUrl.replace("http://localhost:8787", `http://${apiBase}`),
    );
    expect(shot.status).toBe(200);
    expect(shot.headers.get("content-type")).toBe("image/jpeg");
    expect((await shot.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    const forged = opened.screenshotUrl.replace(/s=[^&]+/, "s=forged");
    expect((await server.call(forged.replace("http://localhost:8787", ""))).status).toBe(401);
    const otherUser = opened.screenshotUrl.replace(`u=${userId}`, "u=someone-else");
    expect((await server.call(otherUser.replace("http://localhost:8787", ""))).status).toBe(401);

    const { url } = await server.json(`/api/browsers/${opened.id}/live`, { token: a, body: {} });
    const socket = new WebSocket(url.replace("ws://localhost:8787", `ws://${apiBase}`));
    const seen: string[] = [];
    await new Promise<void>((resolve, reject) => {
      socket.on("message", (raw) => {
        const message = JSON.parse(String(raw));
        seen.push(message.type === "frame" ? "frame" : `${message.type}:${message.title}`);
        if (message.type === "frame" && !seen.includes("sent")) {
          seen.push("sent");
          socket.send(JSON.stringify({ type: "navigate", url: `${origin}/next` }));
        }
        if (message.type === "page" && message.title === "Watering") resolve();
      });
      socket.on("error", reject);
    });
    socket.close();
    expect(seen[0]).toBe("page:Garden");
    expect(seen).toContain("frame");

    const reused = new WebSocket(`${url.replace("ws://localhost:8787", `ws://${apiBase}`)}x`);
    const status = await new Promise((resolve) =>
      reused.on("unexpected-response", (_req, res) => resolve(res.statusCode)),
    );
    expect(status).toBe(401);
  });

  it("browses inside a durable task with its own session", async () => {
    const { token: a } = await server.signUp();
    const created = await server.json(
      "/api/tasks",
      { token: a, body: { prompt: `Research ${origin}/ for my garden` } },
      201,
    );
    const detail = await server.waitForTask(a, created.id, ["succeeded"], 30_000);
    expect(detail.task.result).toContain("Read the page “Garden”");
    expect(detail.events.map((e: { title: string }) => e.title)).toContain("Browsed Garden");
    const sessionsList = await server.json("/api/browsers", { token: a });
    expect(sessionsList[0]).toMatchObject({ taskId: created.id, title: "Garden" });
  });

  it("imports PDF downloads into Files", async () => {
    const { token: a } = await server.signUp();
    const b = await server.signUp();
    const opened = await server.json(
      "/api/browsers",
      { token: a, body: { url: `${origin}/` } },
      201,
    );
    await server.json(`/api/browsers/${opened.id}/navigate`, {
      token: a,
      body: { url: `${origin}/slip.pdf` },
    });
    let downloads: { name: string }[] = [];
    for (let i = 0; i < 50 && !downloads.length; i++) {
      downloads = await server.json(`/api/browsers/${opened.id}/downloads`, { token: a });
      if (!downloads.length) await new Promise((r) => setTimeout(r, 100));
    }
    expect(downloads.map((d) => d.name)).toEqual(["slip.pdf"]);
    await server.json(
      `/api/browsers/${opened.id}/downloads/import`,
      { token: b.token, body: {} },
      404,
    );
    const [file] = await server.json(
      `/api/browsers/${opened.id}/downloads/import`,
      { token: a, body: {} },
      201,
    );
    expect(file).toMatchObject({
      name: "slip.pdf",
      source: "Downloaded from Garden",
      pageCount: 1,
    });
    expect(await server.json(`/api/browsers/${opened.id}/downloads`, { token: a })).toEqual([]);
  });

  it("deletes a session and its profile", async () => {
    const { token: a } = await server.signUp();
    const opened = await server.json(
      "/api/browsers",
      { token: a, body: { url: `${origin}/` } },
      201,
    );
    await server.json(`/api/browsers/${opened.id}`, { token: a, method: "DELETE" }, 204);
    await server.json(`/api/browsers/${opened.id}`, { token: a }, 404);
    expect(existsSync(join(dir, opened.id))).toBe(false);
  });
});
