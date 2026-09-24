import { browserOpenSchema } from "@agent-v/shared";
import type { NodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import WebSocket from "ws";
import type { Context } from "../context.ts";
import { AppError } from "../errors.ts";
import {
  browserOf,
  deleteBrowserSession,
  getBrowserRow,
  listBrowserSessions,
  navigateBrowser,
  openBrowser,
  toBrowserSession,
} from "./service.ts";

type Env = { Variables: { userId: string } };

/**
 * Routes a browser loads directly (image, WebSocket). They carry a signed, short-lived query
 * instead of a bearer token, so they are registered before the auth middleware.
 */
export function signedBrowserRoutes(
  app: Hono<Env>,
  ctx: Context,
  upgradeWebSocket: NodeWebSocket["upgradeWebSocket"],
) {
  const owner = async (path: string, query: Record<string, string>, id: string) => {
    const userId = ctx.signer.verify(path, query);
    if (!userId) throw new AppError("This link expired. Refresh and try again.", 401);
    await getBrowserRow(ctx, userId, id);
    return userId;
  };

  app.get("/api/browsers/:id/screenshot", async (c) => {
    const id = c.req.param("id");
    await owner(c.req.path, c.req.query(), id);
    const image = await browserOf(ctx).screenshot(id);
    return c.body(new Uint8Array(image), 200, {
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=5",
    });
  });

  app.get(
    "/api/browsers/:id/live",
    async (c, next) => {
      await owner(c.req.path, c.req.query(), c.req.param("id"));
      browserOf(ctx);
      await next();
    },
    upgradeWebSocket((c) => {
      const upstream = browserOf(ctx).live(c.req.param("id") ?? "");
      const pending: string[] = [];
      return {
        onOpen: (_event, socket) => {
          upstream.on("message", (data) => socket.send(String(data)));
          upstream.on("close", () => socket.close());
          upstream.on("error", () => socket.close(1011, "Browser unavailable"));
          upstream.on("open", () => {
            for (const message of pending.splice(0)) upstream.send(message);
          });
        },
        onMessage: (event) => {
          const message = String(event.data).slice(0, 16_384);
          if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
          else if (pending.length < 20) pending.push(message);
        },
        onClose: () => upstream.close(),
      };
    }),
  );
}

export function browserRoutes(app: Hono<Env>, ctx: Context) {
  app.get("/api/browsers", async (c) => c.json(await listBrowserSessions(ctx, c.get("userId"))));
  app.post("/api/browsers", async (c) => {
    const { url } = browserOpenSchema.parse(await c.req.json());
    return c.json(await openBrowser(ctx, c.get("userId"), {}, url), 201);
  });
  app.get("/api/browsers/:id", async (c) =>
    c.json(toBrowserSession(ctx, await getBrowserRow(ctx, c.get("userId"), c.req.param("id")))),
  );
  app.post("/api/browsers/:id/navigate", async (c) => {
    const { url } = browserOpenSchema.parse(await c.req.json());
    return c.json(await navigateBrowser(ctx, c.get("userId"), c.req.param("id"), url));
  });
  /** A one-minute WebSocket URL for the live view and take-control. */
  app.post("/api/browsers/:id/live", async (c) => {
    const userId = c.get("userId");
    const row = await getBrowserRow(ctx, userId, c.req.param("id"));
    browserOf(ctx);
    const path = `/api/browsers/${row.id}/live`;
    const base = ctx.config.publicUrl.replace(/^http/, "ws");
    return c.json({ url: `${base}${path}?${ctx.signer.sign(userId, path, 60)}` });
  });
  app.delete("/api/browsers/:id", async (c) => {
    await deleteBrowserSession(ctx, c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  });
}
