import { createHash, timingSafeEqual } from "node:crypto";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { WorkerConfig } from "./config.ts";
import { type InputAction, type Sessions, WorkerError } from "./sessions.ts";

const digest = (value: string) => createHash("sha256").update(value).digest();

const inputSchema: z.ZodType<InputAction> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), x: z.number().finite(), y: z.number().finite() }),
  z.object({ type: z.literal("type"), text: z.string().max(5000) }),
  z.object({ type: z.literal("key"), key: z.string().max(20) }),
  z.object({
    type: z.literal("scroll"),
    dx: z.number().finite().optional(),
    dy: z.number().finite(),
  }),
  z.object({ type: z.literal("navigate"), url: z.string().max(8192) }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("forward") }),
  z.object({ type: z.literal("reload") }),
]);

export function createWorkerApp(config: WorkerConfig, sessions: Sessions) {
  const app = new Hono();
  const ws = createNodeWebSocket({ app });
  const expected = digest(`Bearer ${config.token}`);

  app.get("/health", (c) => c.json({ ok: true, ...sessions.status() }));
  app.use("/sessions/*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    if (!timingSafeEqual(digest(header), expected)) return c.json({ error: "Unauthorized" }, 401);
    await next();
  });
  app.use("/sessions/*", bodyLimit({ maxSize: 64 * 1024 }));
  app.onError((error, c) => {
    if (error instanceof WorkerError) return c.json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return c.json({ error: "Invalid request" }, 422);
    if (error instanceof SyntaxError) return c.json({ error: "Invalid JSON" }, 400);
    console.error("[browser]", error);
    return c.json({ error: "Browser failure" }, 500);
  });

  const url = z.object({ url: z.string().min(1).max(8192) });
  app.post("/sessions/:id/open", async (c) => {
    const body = url.parse(await c.req.json());
    return c.json(await sessions.open(c.req.param("id"), body.url));
  });
  app.get("/sessions/:id/read", async (c) => c.json(await sessions.read(c.req.param("id"))));
  app.post("/sessions/:id/click-link", async (c) => {
    const { name } = z.object({ name: z.string().min(1).max(500) }).parse(await c.req.json());
    return c.json(await sessions.clickLink(c.req.param("id"), name));
  });
  app.post("/sessions/:id/input", async (c) =>
    c.json(await sessions.input(c.req.param("id"), inputSchema.parse(await c.req.json()))),
  );
  app.get("/sessions/:id/screenshot", async (c) => {
    const image = await sessions.screenshot(c.req.param("id"));
    return c.body(new Uint8Array(image), 200, { "content-type": "image/jpeg" });
  });
  app.post("/sessions/:id/close", async (c) => {
    await sessions.close(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.delete("/sessions/:id", async (c) => {
    await sessions.remove(c.req.param("id"));
    return c.json({ ok: true });
  });

  // Live view: JPEG frames out, input actions in.
  app.get(
    "/sessions/:id/live",
    ws.upgradeWebSocket((c) => {
      const id = c.req.param("id") ?? "";
      let stop: (() => void) | undefined;
      let closed = false;
      return {
        onOpen: (_event, socket) => {
          sessions
            .watch(id, (message) => {
              // Drop frames for slow viewers rather than buffering without bound.
              const raw = socket.raw as { bufferedAmount?: number } | undefined;
              if (message.type === "frame" && (raw?.bufferedAmount ?? 0) > 2_000_000) return;
              socket.send(JSON.stringify(message));
            })
            .then((unsubscribe) => {
              if (closed) unsubscribe();
              else stop = unsubscribe;
            })
            .catch((error) => {
              socket.send(JSON.stringify({ type: "error", message: (error as Error).message }));
              socket.close(1011, "Browser unavailable");
            });
        },
        onMessage: (event, socket) => {
          const parsed = inputSchema.safeParse(
            (() => {
              try {
                return JSON.parse(String(event.data));
              } catch {
                return null;
              }
            })(),
          );
          if (!parsed.success) return;
          void sessions.input(id, parsed.data).catch((error) => {
            socket.send(JSON.stringify({ type: "error", message: (error as Error).message }));
          });
        },
        onClose: () => {
          closed = true;
          stop?.();
        },
      };
    }),
  );

  return { app, injectWebSocket: ws.injectWebSocket };
}
