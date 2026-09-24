import { fillPdfSchema, importAttachmentSchema, proposeActionSchema } from "@agent-v/shared";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { html } from "hono/html";
import { z } from "zod";
import { proposeAction } from "../actions.ts";
import type { Context } from "../context.ts";
import { AppError } from "../errors.ts";
import {
  deleteFile,
  fillFile,
  getFileRow,
  listFiles,
  readFileBytes,
  storeFile,
  toFileItem,
} from "../files/service.ts";
import { completeGoogleAuth, disconnectGoogle, startGoogleAuth } from "./google/oauth.ts";
import { workspaceFor, workspaceStatus } from "./index.ts";

type Env = { Variables: { userId: string } };

function page(title: string, message: string) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          body { font: 16px system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; color: #18181b; }
          main { max-width: 28rem; padding: 2rem; text-align: center; }
          h1 { font-size: 1.4rem; }
          p { color: #52525b; }
        </style>
      </head>
      <body>
        <main>
          <h1>${title}</h1>
          <p>${message}</p>
        </main>
      </body>
    </html>`;
}

/** Routes reached without a bearer token: Google's redirect, and signed file links. */
export function publicWorkspaceRoutes(app: Hono<Env>, ctx: Context) {
  app.get("/api/google/callback", async (c) => {
    c.header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");
    const { state, code, error } = c.req.query();
    if (error || !state || !code)
      return c.html(
        page("Google was not connected", "You can close this window and try again from Agent V."),
        400,
      );
    try {
      await completeGoogleAuth(ctx, state, code);
      return c.html(
        page("Google is connected", "You can close this window and return to Agent V."),
      );
    } catch (e) {
      const message = e instanceof AppError ? e.message : "Something went wrong.";
      return c.html(page("Google was not connected", message), 400);
    }
  });

  app.get("/api/files/:id/content", async (c) => {
    const id = c.req.param("id");
    const userId = ctx.signer.verify(c.req.path, c.req.query());
    if (!userId) throw new AppError("This link expired. Refresh and try again.", 401);
    const { row, bytes } = await readFileBytes(ctx, userId, id);
    return c.body(bytes, 200, {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "cache-control": "private, max-age=300",
      // Only the app itself may show the PDF in a frame.
      "content-security-policy": `frame-ancestors 'self' ${ctx.config.allowedOrigins.join(" ")}`,
    });
  });
}

export function workspaceRoutes(app: Hono<Env>, ctx: Context) {
  app.get("/api/workspace", async (c) => c.json(await workspaceStatus(ctx, c.get("userId"))));
  app.post("/api/google/connect", async (c) => {
    const { capability } = z
      .object({ capability: z.enum(["read", "write"]).default("read") })
      .parse(await c.req.json().catch(() => ({})));
    return c.json({ url: await startGoogleAuth(ctx, c.get("userId"), capability) });
  });
  app.post("/api/google/disconnect", async (c) => {
    await disconnectGoogle(ctx, c.get("userId"));
    return c.json({ ok: true });
  });

  // Mail and calendar (Google or the demo workspace)
  app.get("/api/mail", async (c) => {
    const q = z.string().max(500).default("").parse(c.req.query("q"));
    return c.json(await (await workspaceFor(ctx, c.get("userId"))).searchMail(q, 25));
  });
  app.get("/api/mail/threads/:id", async (c) =>
    c.json(await (await workspaceFor(ctx, c.get("userId"))).getThread(c.req.param("id"))),
  );
  app.post("/api/mail/attachments/import", async (c) => {
    const userId = c.get("userId");
    const { messageId, attachmentId } = importAttachmentSchema.parse(await c.req.json());
    const blob = await (await workspaceFor(ctx, userId)).getAttachment(messageId, attachmentId);
    return c.json(await storeFile(ctx, userId, { ...blob, source: "Email attachment" }), 201);
  });
  app.get("/api/calendar/events", async (c) => {
    const now = Date.now();
    const query = z
      .object({
        from: z.iso.datetime({ offset: true }).default(new Date(now - 86_400_000).toISOString()),
        to: z.iso.datetime({ offset: true }).default(new Date(now + 21 * 86_400_000).toISOString()),
      })
      .parse(c.req.query());
    const span = Date.parse(query.to) - Date.parse(query.from);
    if (span <= 0 || span > 366 * 86_400_000)
      throw new AppError("Choose a range between one moment and a year", 422);
    return c.json(await (await workspaceFor(ctx, c.get("userId"))).listEvents(query));
  });

  // Files
  app.get("/api/files", async (c) => c.json(await listFiles(ctx, c.get("userId"))));
  app.post("/api/files", bodyLimit({ maxSize: 11 * 1024 * 1024 }), async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) throw new AppError("Choose a PDF to upload", 422);
    return c.json(
      await storeFile(ctx, c.get("userId"), {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        source: "Uploaded by you",
      }),
      201,
    );
  });
  app.get("/api/files/:id", async (c) =>
    c.json(toFileItem(ctx, await getFileRow(ctx, c.get("userId"), c.req.param("id")))),
  );
  app.post("/api/files/:id/fill", async (c) => {
    const { values } = fillPdfSchema.parse(await c.req.json());
    return c.json(await fillFile(ctx, c.get("userId"), c.req.param("id"), values), 201);
  });
  app.delete("/api/files/:id", async (c) => {
    await deleteFile(ctx, c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  });

  /** Propose an email or calendar change directly (not from a task). Runs only after approval. */
  app.post("/api/actions", async (c) => {
    const input = proposeActionSchema.parse(await c.req.json());
    return c.json(await proposeAction(ctx, c.get("userId"), input), 201);
  });
}
