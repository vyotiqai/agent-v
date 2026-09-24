import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BlockedDestinationError, parseWebUrl } from "@agent-v/net";
import { type BrowserContext, type CDPSession, chromium, type Page } from "playwright-core";
import type { WorkerConfig } from "./config.ts";
import { blockedHeader } from "./proxy.ts";

export class WorkerError extends Error {
  readonly status: 400 | 404 | 409 | 422 | 502 | 504;
  constructor(message: string, status: WorkerError["status"] = 400) {
    super(message);
    this.status = status;
  }
}

export interface PageState {
  url: string;
  title: string;
}
export interface PageText extends PageState {
  text: string;
  truncated: boolean;
}

export type LiveMessage =
  | { type: "frame"; data: string; width: number; height: number }
  | { type: "page"; url: string; title: string };

export type InputAction =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "scroll"; dx?: number; dy: number }
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" };

const viewport = { width: 1280, height: 800 };
const allowedKeys = new Set([
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Space",
]);

interface Session {
  id: string;
  context: BrowserContext;
  page: Page;
  cdp?: CDPSession;
  viewers: Set<(message: LiveMessage) => void>;
  lastUsed: number;
}

/**
 * Persistent Chromium sessions, one profile directory per session id. The API server owns
 * the mapping from users to session ids; this worker only trusts callers holding its token.
 */
export class Sessions {
  private readonly config: WorkerConfig;
  private readonly proxyUrl: string;
  private readonly active = new Map<string, Session>();
  private readonly starting = new Map<string, Promise<Session>>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private sweeper?: ReturnType<typeof setInterval>;

  constructor(config: WorkerConfig, proxyUrl: string) {
    this.config = config;
    this.proxyUrl = proxyUrl;
  }

  start() {
    this.sweeper = setInterval(() => void this.sweep(), 60_000);
    this.sweeper.unref();
  }

  async stop() {
    if (this.sweeper) clearInterval(this.sweeper);
    await Promise.all([...this.active.keys()].map((id) => this.close(id)));
  }

  private dir(id: string) {
    if (!/^[a-z0-9-]{8,64}$/i.test(id)) throw new WorkerError("Invalid session id", 400);
    return join(this.config.dataDir, id);
  }

  /** Run operations on one session in order; different sessions run in parallel. */
  private serial<T>(id: string, run: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(run);
    this.queues.set(id, next);
    const cleanup = () => {
      if (this.queues.get(id) === next) this.queues.delete(id);
    };
    next.then(cleanup, cleanup);
    return next;
  }

  private checkUrl(raw: string) {
    try {
      return parseWebUrl(raw).toString();
    } catch (error) {
      if (error instanceof BlockedDestinationError) throw new WorkerError(error.message, 422);
      throw error;
    }
  }

  private async ensure(id: string): Promise<Session> {
    const existing = this.active.get(id);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing;
    }
    const pending = this.starting.get(id);
    if (pending) return pending;
    const launching = this.launch(id).finally(() => this.starting.delete(id));
    this.starting.set(id, launching);
    return launching;
  }

  private async launch(id: string): Promise<Session> {
    while (this.active.size >= this.config.maxActive) {
      const idle = [...this.active.values()]
        .filter((s) => !s.viewers.size)
        .sort((a, b) => a.lastUsed - b.lastUsed)[0];
      if (!idle) throw new WorkerError("All browsers are busy. Try again shortly.", 409);
      await this.close(idle.id);
    }
    const dir = this.dir(id);
    await mkdir(join(dir, "profile"), { recursive: true, mode: 0o700 });
    const context = await chromium.launchPersistentContext(join(dir, "profile"), {
      executablePath: this.config.chromiumPath,
      headless: true,
      viewport,
      deviceScaleFactor: 1,
      acceptDownloads: false,
      serviceWorkers: "block",
      proxy: { server: this.proxyUrl, bypass: "<-loopback>" },
      // Chromium must never resolve or connect on its own: everything goes through the proxy.
      args: [
        "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
        "--disable-quic",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--no-first-run",
      ],
      env: { PATH: process.env.PATH ?? "", HOME: dir },
      timeout: 30_000,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    const session: Session = { id, context, page, viewers: new Set(), lastUsed: Date.now() };
    // New tabs open in the main page instead, so there is always exactly one view.
    context.on("page", (popup) => {
      if (popup === session.page) return;
      void popup
        .waitForURL(/^https?:/, { timeout: 5000 })
        .then(() => session.page.goto(popup.url()))
        .catch(() => {})
        .finally(() => popup.close().catch(() => {}));
    });
    page.on("dialog", (dialog) => void dialog.dismiss().catch(() => {}));
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) void this.announce(session);
    });
    context.on("close", () => {
      if (this.active.get(id) === session) this.active.delete(id);
    });
    this.active.set(id, session);
    const last = await readFile(join(dir, "last-url"), "utf8").catch(() => "");
    if (last) await this.goto(session, last).catch(() => {});
    return session;
  }

  private async goto(session: Session, url: string) {
    try {
      const response = await session.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (response?.headers()[blockedHeader])
        throw new WorkerError("That address is private or not allowed", 422);
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      const message = (error as Error).message;
      if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY|403/.test(message))
        throw new WorkerError("That address is blocked or unreachable", 422);
      if (/Timeout/i.test(message)) throw new WorkerError("The page took too long to load", 504);
      throw new WorkerError(`Could not open the page: ${message.split("\n")[0]}`, 502);
    }
    // Give client-side apps a moment to render, without waiting forever on busy pages.
    await session.page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
    await writeFile(join(this.dir(session.id), "last-url"), session.page.url()).catch(() => {});
  }

  private async state(session: Session): Promise<PageState> {
    return { url: session.page.url(), title: await session.page.title().catch(() => "") };
  }

  private async announce(session: Session) {
    if (!session.viewers.size) return;
    const state = await this.state(session);
    for (const viewer of session.viewers) viewer({ type: "page", ...state });
  }

  async open(id: string, url: string): Promise<PageState> {
    const target = this.checkUrl(url);
    return this.serial(id, async () => {
      const session = await this.ensure(id);
      await this.goto(session, target);
      return this.state(session);
    });
  }

  read(id: string, maxChars = 30_000): Promise<PageText> {
    return this.serial(id, async () => {
      const session = await this.ensure(id);
      const text = await session.page
        .locator("body")
        .innerText({ timeout: 5000 })
        .catch(() => "");
      const clean = text.replace(/\n{3,}/g, "\n\n").trim();
      return {
        ...(await this.state(session)),
        text: clean.slice(0, maxChars),
        truncated: clean.length > maxChars,
      };
    });
  }

  clickLink(id: string, name: string): Promise<PageState> {
    return this.serial(id, async () => {
      const session = await this.ensure(id);
      const link = session.page.getByRole("link", { name }).first();
      const href = await link.getAttribute("href", { timeout: 3000 }).catch(() => null);
      if (href === null) throw new WorkerError(`No link named “${name}” on this page`, 404);
      const target = new URL(href, session.page.url()).toString();
      await this.goto(session, this.checkUrl(target));
      return this.state(session);
    });
  }

  input(id: string, action: InputAction): Promise<PageState> {
    return this.serial(id, async () => {
      const session = await this.ensure(id);
      const { page } = session;
      switch (action.type) {
        case "click":
          await page.mouse.click(
            Math.max(0, Math.min(viewport.width, action.x)),
            Math.max(0, Math.min(viewport.height, action.y)),
          );
          break;
        case "type":
          await page.keyboard.type(action.text.slice(0, 5000));
          break;
        case "key":
          if (!allowedKeys.has(action.key)) throw new WorkerError("Key not allowed", 422);
          await page.keyboard.press(action.key === "Space" ? " " : action.key);
          break;
        case "scroll":
          await page.mouse.wheel(action.dx ?? 0, Math.max(-5000, Math.min(5000, action.dy)));
          break;
        case "navigate":
          await this.goto(session, this.checkUrl(action.url));
          break;
        case "back":
          await page.goBack({ timeout: 15_000 }).catch(() => null);
          break;
        case "forward":
          await page.goForward({ timeout: 15_000 }).catch(() => null);
          break;
        case "reload":
          await page.reload({ timeout: 15_000 }).catch(() => null);
          break;
      }
      session.lastUsed = Date.now();
      return this.state(session);
    });
  }

  screenshot(id: string): Promise<Buffer> {
    return this.serial(id, async () => {
      const session = await this.ensure(id);
      return session.page.screenshot({ type: "jpeg", quality: 70, timeout: 10_000 });
    });
  }

  /** Stream JPEG frames of the page while anyone is watching. Returns an unsubscribe function. */
  async watch(id: string, viewer: (message: LiveMessage) => void): Promise<() => void> {
    const session = await this.serial(id, () => this.ensure(id));
    session.viewers.add(viewer);
    viewer({ type: "page", ...(await this.state(session)) });
    if (!session.cdp) {
      const cdp = await session.context.newCDPSession(session.page);
      session.cdp = cdp;
      cdp.on("Page.screencastFrame", (frame) => {
        for (const v of session.viewers)
          v({
            type: "frame",
            data: frame.data,
            width: frame.metadata.deviceWidth ?? viewport.width,
            height: frame.metadata.deviceHeight ?? viewport.height,
          });
        void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
      });
      await cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 60,
        maxWidth: viewport.width,
        maxHeight: viewport.height,
        everyNthFrame: 1,
      });
    }
    return () => {
      session.viewers.delete(viewer);
      session.lastUsed = Date.now();
      if (!session.viewers.size && session.cdp) {
        const cdp = session.cdp;
        session.cdp = undefined;
        void cdp
          .send("Page.stopScreencast")
          .catch(() => {})
          .finally(() => cdp.detach().catch(() => {}));
      }
    };
  }

  async close(id: string) {
    const session = this.active.get(id);
    if (!session) return;
    this.active.delete(id);
    for (const viewer of session.viewers) viewer({ type: "page", url: "", title: "Closed" });
    await session.context.close().catch(() => {});
  }

  /** Close and erase the profile (cookies, storage, history). */
  async remove(id: string) {
    const dir = this.dir(id);
    await this.serial(id, async () => {
      await this.close(id);
      await rm(dir, { recursive: true, force: true });
    });
  }

  status() {
    return { active: this.active.size, max: this.config.maxActive };
  }

  private async sweep() {
    const cutoff = Date.now() - this.config.idleMs;
    for (const session of [...this.active.values()])
      if (!session.viewers.size && session.lastUsed < cutoff) await this.close(session.id);
  }
}
