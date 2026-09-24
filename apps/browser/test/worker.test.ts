import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createWorkerApp } from "../src/app.ts";
import type { WorkerConfig } from "../src/config.ts";
import { type EgressProxy, startEgressProxy } from "../src/proxy.ts";
import { Sessions } from "../src/sessions.ts";

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
const token = "t".repeat(40);

const pages: Record<string, string> = {
  "/": `<title>Home</title><h1>Welcome</h1><p>Agent V test page.</p><a href="/next">Next page</a> <a href="/secret" target="_blank">New tab</a>`,
  "/next": `<title>Next</title><p>You followed the link.</p><input id="q" autofocus>`,
  "/secret": `<title>Secret</title><p>Opened from a popup.</p>`,
  "/popup": `<title>Popup</title><body style="margin:0;height:100vh" onclick="window.open('/secret')">Click anywhere</body>`,
  "/script": `<title>Script</title><div id="out"></div><script>document.getElementById("out").textContent = "Rendered by JavaScript";</script>`,
};

let site: Server;
let pdfBytes: Buffer;
let origin: string;
let dir: string;
let proxy: EgressProxy;
let strictProxy: EgressProxy;
let sessions: Sessions;
let strict: Sessions;

const config = (allowPrivate: boolean): WorkerConfig => ({
  host: "127.0.0.1",
  port: 0,
  token,
  dataDir: dir,
  chromiumPath,
  maxActive: 2,
  idleMs: 60_000,
  allowPrivate,
});

beforeAll(async () => {
  pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  site = createServer((req, res) => {
    if (req.url === "/report.pdf")
      return res
        .writeHead(200, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="report.pdf"',
        })
        .end(pdfBytes);
    if (req.url === "/fake.pdf")
      return res
        .writeHead(200, {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="fake.pdf"',
        })
        .end("not a pdf");
    const body = pages[req.url ?? ""];
    if (!body) return res.writeHead(404).end("missing");
    res.writeHead(200, { "content-type": "text/html" }).end(body);
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
  dir = await mkdtemp(join(tmpdir(), "agent-v-browser-"));
  proxy = await startEgressProxy({ allowPrivate: true });
  strictProxy = await startEgressProxy({ allowPrivate: false });
  sessions = new Sessions(config(true), proxy.url);
  strict = new Sessions(config(false), strictProxy.url);
});

afterAll(async () => {
  await sessions?.stop();
  await strict?.stop();
  await proxy?.close();
  await strictProxy?.close();
  site?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!chromiumPath)("browser sessions", () => {
  const id = "11111111-aaaa-4bbb-8ccc-000000000001";

  it("opens, reads JavaScript-rendered pages and follows links", async () => {
    expect(await sessions.open(id, `${origin}/`)).toEqual({ url: `${origin}/`, title: "Home" });
    const home = await sessions.read(id);
    expect(home.text).toContain("Agent V test page.");
    await sessions.open(id, `${origin}/script`);
    expect((await sessions.read(id)).text).toContain("Rendered by JavaScript");
    await sessions.open(id, `${origin}/`);
    expect(await sessions.clickLink(id, "Next page")).toMatchObject({ title: "Next" });
    await expect(sessions.clickLink(id, "Nope")).rejects.toThrow(/No link named/);
  });

  it("keeps one view: new tabs load in the main page", async () => {
    await sessions.open(id, `${origin}/popup`);
    await sessions.input(id, { type: "click", x: 200, y: 200 });
    for (let i = 0; i < 50 && (await sessions.read(id)).title !== "Secret"; i++)
      await new Promise((r) => setTimeout(r, 100));
    expect((await sessions.read(id)).title).toBe("Secret");
  });

  it("takes input and restores the last page after a restart", async () => {
    await sessions.open(id, `${origin}/next`);
    await sessions.input(id, { type: "type", text: "hello" });
    await sessions.input(id, { type: "key", key: "Enter" });
    await expect(sessions.input(id, { type: "key", key: "Meta+Q" })).rejects.toThrow(/not allowed/);
    await sessions.close(id);
    expect((await sessions.read(id)).title).toBe("Next");
  });

  it("keeps PDF downloads and discards anything else", async () => {
    const dl = "11111111-aaaa-4bbb-8ccc-000000000003";
    await sessions.open(dl, `${origin}/`);
    await sessions.open(dl, `${origin}/fake.pdf`);
    await sessions.open(dl, `${origin}/report.pdf`);
    let list = await sessions.downloads(dl);
    for (let i = 0; i < 50 && !list.length; i++) {
      await new Promise((r) => setTimeout(r, 100));
      list = await sessions.downloads(dl);
    }
    await new Promise((r) => setTimeout(r, 300));
    list = await sessions.downloads(dl);
    expect(list.map((d) => d.name)).toEqual(["report.pdf"]);
    expect(Buffer.compare(await sessions.downloadBytes(dl, list[0]?.id ?? ""), pdfBytes)).toBe(0);
    await expect(sessions.downloadBytes(dl, "../../etc/passwd")).rejects.toThrow(
      /Invalid download/,
    );
    await sessions.removeDownload(dl, list[0]?.id ?? "");
    expect(await sessions.downloads(dl)).toEqual([]);
    expect((await sessions.read(dl)).title).toBe("Home");
  });

  it("refuses non-web URLs and, in strict mode, private networks", async () => {
    await expect(sessions.open(id, "file:///etc/passwd")).rejects.toThrow(/http and https/);
    await expect(
      sessions.input(id, { type: "navigate", url: "chrome://settings" }),
    ).rejects.toThrow(/http and https/);
    const other = "11111111-aaaa-4bbb-8ccc-000000000002";
    await expect(strict.open(other, `${origin}/`)).rejects.toThrow(/private or not allowed/);
    await expect(strict.open(other, "https://127.0.0.1/")).rejects.toThrow(
      /blocked or unreachable/,
    );
    await strict.remove(other);
  });

  it("serves live frames and input over the WebSocket API", async () => {
    const { app, injectWebSocket } = createWorkerApp(config(true), sessions);
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
    injectWebSocket(server);
    await new Promise((r) => server.once("listening", r));
    const base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const denied = await fetch(`http://${base}/sessions/${id}/read`);
      expect(denied.status).toBe(401);
      const opened = await fetch(`http://${base}/sessions/${id}/open`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ url: `${origin}/` }),
      });
      expect(await opened.json()).toMatchObject({ title: "Home" });

      const socket = new WebSocket(`ws://${base}/sessions/${id}/live`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const seen: string[] = [];
      await new Promise<void>((resolve, reject) => {
        socket.on("message", (raw) => {
          const message = JSON.parse(String(raw));
          seen.push(
            message.type === "frame"
              ? `frame:${message.width}x${message.height}`
              : `${message.type}:${message.title ?? ""}`,
          );
          if (message.type === "frame" && !seen.includes("sent")) {
            seen.push("sent");
            socket.send(JSON.stringify({ type: "navigate", url: `${origin}/next` }));
          }
          if (message.type === "page" && message.title === "Next") resolve();
        });
        socket.on("error", reject);
      });
      socket.close();
      expect(seen[0]).toBe("page:Home");
      expect(seen).toContain("frame:1280x800");

      const unauthorized = new WebSocket(`ws://${base}/sessions/${id}/live`);
      const code = await new Promise((resolve) =>
        unauthorized.on("unexpected-response", (_r, res) => resolve(res.statusCode)),
      );
      expect(code).toBe(401);
    } finally {
      server.close();
    }
  });
});
