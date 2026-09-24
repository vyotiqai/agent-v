import {
  actionDecisionSchema,
  createTaskSchema,
  createThreadSchema,
  memoryInputSchema,
  runInputSchema,
  settingsInputSchema,
  taskAnswerSchema,
  taskControlSchema,
  updateThreadSchema,
} from "@agent-v/shared";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { APIError } from "better-auth/api";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { accountRoutes, publicAccountRoutes } from "./account/routes.ts";
import { decideAction, executeAction, getAction } from "./actions.ts";
import { type Auth, clientIpHeader } from "./auth.ts";
import { browserRoutes, signedBrowserRoutes } from "./browser/routes.ts";
import { runChat } from "./chat/run.ts";
import { createThread, listMessages, listThreads, updateThread } from "./chat/threads.ts";
import { computerRoutes } from "./computer/routes.ts";
import type { Context } from "./context.ts";
import { AppError } from "./errors.ts";
import { lifeRoutes } from "./goals/routes.ts";
import { connectorRoutes, publicConnectorRoutes } from "./mcp/routes.ts";
import { publicWorkspaceRoutes, workspaceRoutes } from "./providers/routes.ts";
import { pushRoutes } from "./push/routes.ts";
import { MemoryStore, PostgresStore, rateLimiter } from "./ratelimit.ts";
import {
  answerTask,
  cancelTask,
  createTask,
  getTaskDetail,
  getTaskRow,
  listTasks,
  retryTask,
} from "./tasks/service.ts";
import { httpTracing } from "./telemetry.ts";
import { transcriptionAvailable, voiceRoutes } from "./voice.ts";
import {
  addMemory,
  getSettings,
  listMemories,
  listNotifications,
  markNotificationsRead,
  removeMemory,
  updateSettings,
} from "./workspace.ts";

type Env = { Variables: { userId: string } };

function safeRemoteAddress(c: Parameters<typeof getConnInfo>[0]) {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // Not running on the Node adapter (for example in tests).
  }
}

export function createApp(ctx: Context, auth: Auth, options: { tracing?: boolean } = {}) {
  const app = new Hono<Env>();
  if (options.tracing) app.use("*", httpTracing());
  const ws = createNodeWebSocket({ app });
  const origins = new Set(ctx.config.allowedOrigins);

  // Framing is decided per route (file previews may be framed by the app's own origins).
  app.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin", xFrameOptions: false }));
  app.use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("content-security-policy"))
      c.res.headers.set("content-security-policy", "frame-ancestors 'none'");
  });
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (origins.has(origin) ? origin : null),
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["set-auth-token"],
      credentials: true,
      maxAge: 600,
    }),
  );
  const smallBodies = bodyLimit({ maxSize: 1024 * 1024 });
  // Uploads and CSV imports carry their own, larger limit on the route.
  const ownLimit = new Set(["/api/files", "/api/finance/import", "/api/voice/transcribe"]);
  app.use("/api/*", (c, next) =>
    c.req.method === "POST" && ownLimit.has(c.req.path) ? next() : smallBodies(c, next),
  );
  app.onError((error, c) => {
    if (error instanceof AppError) return c.json({ error: error.message }, error.status);
    if (error instanceof APIError)
      return c.json(
        { error: error.body?.message ?? error.message },
        error.statusCode as ContentfulStatusCode,
      );
    if (error instanceof z.ZodError)
      return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 422);
    if (error instanceof SyntaxError) return c.json({ error: "Invalid JSON" }, 400);
    console.error("[api]", error);
    return c.json({ error: "Something went wrong" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  // Teams, operator actions and account deletion go through /api/team, /api/admin and
  // /api/account (which add their own checks and side effects), never straight to Better Auth.
  const internalAuth = /^\/api\/auth\/(organization|admin)\/|^\/api\/auth\/delete-user/;
  app.on(["GET", "POST"], "/api/auth/*", (c) => {
    if (internalAuth.test(c.req.path))
      return Response.json({ error: "Not found" }, { status: 404 });
    const headers = new Headers(c.req.raw.headers);
    headers.delete(clientIpHeader);
    const ip = ctx.config.trustProxy
      ? c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      : safeRemoteAddress(c);
    if (ip) headers.set(clientIpHeader, ip);
    return auth.handler(new Request(c.req.raw, { headers }));
  });

  signedBrowserRoutes(app, ctx, ws.upgradeWebSocket);
  publicWorkspaceRoutes(app, ctx);
  publicConnectorRoutes(app, ctx);
  publicAccountRoutes(app, ctx);

  app.use("/api/*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Sign in to continue" }, 401);
    c.set("userId", session.user.id);
    await next();
  });
  if (ctx.config.rateLimits.enabled)
    app.use(
      "/api/*",
      rateLimiter(
        ctx.config.rateLimits.store === "postgres" ? new PostgresStore(ctx) : new MemoryStore(),
      ),
    );

  const json = async <T extends z.ZodType>(c: { req: { json(): Promise<unknown> } }, schema: T) =>
    schema.parse(await c.req.json()) as z.output<T>;

  // Profile and preferences
  app.get("/api/me", async (c) => {
    const userId = c.get("userId");
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return c.json({
      user: session?.user,
      settings: await getSettings(ctx, userId),
      models: ctx.models.options(),
      features: {
        plans: ctx.config.plans.enforced,
        billing: Boolean(ctx.config.stripe),
        email: ctx.mailer.delivers,
        admin: (session?.user as { role?: string } | undefined)?.role === "admin",
        browser: Boolean(ctx.browser),
        computer: Boolean(ctx.config.computer),
        sampleConnector: ctx.config.mcpDemo,
        transcription: transcriptionAvailable(ctx),
      },
    });
  });
  app.patch("/api/settings", async (c) =>
    c.json(await updateSettings(ctx, c.get("userId"), await json(c, settingsInputSchema))),
  );

  // Chats
  app.get("/api/threads", async (c) => c.json(await listThreads(ctx, c.get("userId"))));
  app.post("/api/threads", async (c) => {
    const { title } = await json(c, createThreadSchema);
    return c.json(await createThread(ctx, c.get("userId"), title), 201);
  });
  app.patch("/api/threads/:id", async (c) =>
    c.json(
      await updateThread(
        ctx,
        c.get("userId"),
        c.req.param("id"),
        await json(c, updateThreadSchema),
      ),
    ),
  );
  app.get("/api/threads/:id/messages", async (c) =>
    c.json(await listMessages(ctx, c.get("userId"), c.req.param("id"))),
  );
  app.post("/api/threads/:id/runs", async (c) => {
    const userId = c.get("userId");
    const input = await json(c, runInputSchema);
    const controller = new AbortController();
    const events = runChat(ctx, userId, c.req.param("id"), input, controller.signal);
    // Surface validation and ownership errors as HTTP errors before streaming starts.
    const first = await events.next();
    return streamSSE(c, async (stream) => {
      stream.onAbort(() => controller.abort());
      if (!first.done) await stream.writeSSE({ data: JSON.stringify(first.value) });
      for await (const event of events) await stream.writeSSE({ data: JSON.stringify(event) });
    });
  });

  // Durable tasks
  app.get("/api/tasks", async (c) => c.json(await listTasks(ctx, c.get("userId"))));
  app.post("/api/tasks", async (c) =>
    c.json(await createTask(ctx, c.get("userId"), await json(c, createTaskSchema)), 201),
  );
  app.get("/api/tasks/:id", async (c) =>
    c.json(await getTaskDetail(ctx, c.get("userId"), c.req.param("id"))),
  );
  app.post("/api/tasks/:id/answer", async (c) => {
    const { answer } = await json(c, taskAnswerSchema);
    return c.json(await answerTask(ctx, c.get("userId"), c.req.param("id"), answer));
  });
  app.post("/api/tasks/:id/control", async (c) => {
    const { action } = await json(c, taskControlSchema);
    const userId = c.get("userId");
    const id = c.req.param("id");
    return c.json(
      action === "cancel" ? await cancelTask(ctx, userId, id) : await retryTask(ctx, userId, id),
    );
  });

  // Reviews
  app.get("/api/actions/:id", async (c) =>
    c.json(await getAction(ctx, c.get("userId"), c.req.param("id"))),
  );
  app.post("/api/actions/:id/decide", async (c) => {
    const userId = c.get("userId");
    const { hash, decision } = await json(c, actionDecisionSchema);
    const pending = await getAction(ctx, userId, c.req.param("id"));
    const task = pending.taskId ? await getTaskRow(ctx, userId, pending.taskId) : null;
    if (task && (task.status !== "waiting_approval" || task.actionId !== pending.id))
      throw new AppError("Resume the task before deciding on its action", 409);
    const action = await decideAction(ctx, userId, pending.id, hash, decision);
    if (task) await DBOS.send(task.workflowId, { actionId: action.id }, "approval");
    // Actions proposed outside a task run as soon as they are approved.
    else if (action.status === "approved")
      return c.json(await executeAction(ctx, userId, action.id));
    return c.json(action);
  });

  // Memory and notifications
  app.get("/api/memories", async (c) => c.json(await listMemories(ctx, c.get("userId"))));
  app.post("/api/memories", async (c) => {
    const { text } = await json(c, memoryInputSchema);
    return c.json(await addMemory(ctx, c.get("userId"), text, "Added by you"), 201);
  });
  app.delete("/api/memories/:id", async (c) => {
    await removeMemory(ctx, c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.get("/api/notifications", async (c) => c.json(await listNotifications(ctx, c.get("userId"))));
  app.post("/api/notifications/read", async (c) => {
    const body = z
      .object({ id: z.string().optional() })
      .parse(await c.req.json().catch(() => ({})));
    await markNotificationsRead(ctx, c.get("userId"), body.id);
    return c.json({ ok: true });
  });

  browserRoutes(app, ctx);
  workspaceRoutes(app, ctx);
  computerRoutes(app, ctx);
  lifeRoutes(app, ctx);
  connectorRoutes(app, ctx);
  pushRoutes(app, ctx);
  voiceRoutes(app, ctx);
  accountRoutes(app, ctx, auth);

  // Live workspace changes: one SSE stream per device replaces polling.
  app.get("/api/events", (c) => {
    const userId = c.get("userId");
    return streamSSE(c, async (stream) => {
      const unsubscribe = ctx.realtime.subscribe(userId, (event) => {
        void stream.writeSSE({ event: "change", data: JSON.stringify(event) });
      });
      const heartbeat = setInterval(() => void stream.write(": ping\n\n"), 20_000);
      await stream.writeSSE({ event: "ready", data: "{}" });
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // The exported web app, from the API's own origin (one image serves both).
  if (ctx.config.webDir) {
    const root = ctx.config.webDir;
    const pageCsp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https:",
      "worker-src 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    const web = (path?: string) => serveStatic({ root, path });
    const pages =
      (handler: ReturnType<typeof web>): MiddlewareHandler =>
      async (c, next) => {
        if (c.req.path.startsWith("/api/")) return next();
        const res = await handler(c, next);
        if (res instanceof Response && res.ok) {
          const hashed = c.req.path.startsWith("/_expo/static/");
          res.headers.set(
            "cache-control",
            hashed ? "public, max-age=31536000, immutable" : "no-cache",
          );
          if (res.headers.get("content-type")?.startsWith("text/html"))
            res.headers.set("content-security-policy", pageCsp);
        }
        return res;
      };
    app.get("*", pages(web()));
    // Client-side routes (/plan, /team, …) all load the single-page app.
    app.get("*", pages(web("index.html")));
  }

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return { app, injectWebSocket: ws.injectWebSocket };
}
