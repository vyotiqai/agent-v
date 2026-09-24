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
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { decideAction, getAction } from "./actions.ts";
import { type Auth, clientIpHeader } from "./auth.ts";
import { browserRoutes, signedBrowserRoutes } from "./browser/routes.ts";
import { runChat } from "./chat/run.ts";
import { createThread, listMessages, listThreads, updateThread } from "./chat/threads.ts";
import type { Context } from "./context.ts";
import { AppError } from "./errors.ts";
import {
  answerTask,
  cancelTask,
  createTask,
  getTaskDetail,
  getTaskRow,
  listTasks,
  retryTask,
} from "./tasks/service.ts";
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

export function createApp(ctx: Context, auth: Auth) {
  const app = new Hono<Env>();
  const ws = createNodeWebSocket({ app });
  const origins = new Set(ctx.config.allowedOrigins);

  app.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (origins.has(origin) ? origin : null),
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["set-auth-token"],
      credentials: true,
      maxAge: 600,
    }),
  );
  app.use("/api/*", bodyLimit({ maxSize: 1024 * 1024 }));
  app.onError((error, c) => {
    if (error instanceof AppError) return c.json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 422);
    if (error instanceof SyntaxError) return c.json({ error: "Invalid JSON" }, 400);
    console.error("[api]", error);
    return c.json({ error: "Something went wrong" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.on(["GET", "POST"], "/api/auth/*", (c) => {
    const headers = new Headers(c.req.raw.headers);
    headers.delete(clientIpHeader);
    const ip = ctx.config.trustProxy
      ? c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      : safeRemoteAddress(c);
    if (ip) headers.set(clientIpHeader, ip);
    return auth.handler(new Request(c.req.raw, { headers }));
  });

  signedBrowserRoutes(app, ctx, ws.upgradeWebSocket);

  app.use("/api/*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Sign in to continue" }, 401);
    c.set("userId", session.user.id);
    await next();
  });

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
      features: { browser: Boolean(ctx.browser) },
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
  app.post("/api/actions/:id/decide", async (c) => {
    const userId = c.get("userId");
    const { hash, decision } = await json(c, actionDecisionSchema);
    const pending = await getAction(ctx, userId, c.req.param("id"));
    const task = pending.taskId ? await getTaskRow(ctx, userId, pending.taskId) : null;
    if (task && (task.status !== "waiting_approval" || task.actionId !== pending.id))
      throw new AppError("Resume the task before deciding on its action", 409);
    const action = await decideAction(ctx, userId, pending.id, hash, decision);
    if (task) await DBOS.send(task.workflowId, { actionId: action.id }, "approval");
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

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return { app, injectWebSocket: ws.injectWebSocket };
}
