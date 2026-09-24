import {
  computerCommandSchema,
  computerImportSchema,
  computerPathSchema,
  computerWriteSchema,
} from "@agent-v/shared";
import type { Hono } from "hono";
import type { Context } from "../context.ts";
import {
  cancelCommand,
  computerFiles,
  computerStatus,
  eraseComputer,
  runCommand,
  startComputer,
  stopComputer,
} from "./service.ts";

type Env = { Variables: { userId: string } };

export function computerRoutes(app: Hono<Env>, ctx: Context) {
  app.get("/api/computer", async (c) => c.json(await computerStatus(ctx, c.get("userId"))));
  app.post("/api/computer/start", async (c) => c.json(await startComputer(ctx, c.get("userId"))));
  app.post("/api/computer/stop", async (c) => c.json(await stopComputer(ctx, c.get("userId"))));
  app.post("/api/computer/erase", async (c) => c.json(await eraseComputer(ctx, c.get("userId"))));
  app.post("/api/computer/cancel", async (c) =>
    c.json({ cancelled: await cancelCommand(ctx, c.get("userId")) }),
  );
  app.post("/api/computer/commands", async (c) => {
    const input = computerCommandSchema.parse(await c.req.json());
    return c.json(await runCommand(ctx, c.get("userId"), input), 201);
  });
  app.get("/api/computer/files", async (c) => {
    const { path } = computerPathSchema.parse({ path: c.req.query("path") ?? "/workspace" });
    return c.json(await computerFiles.list(ctx, c.get("userId"), path));
  });
  app.get("/api/computer/file", async (c) => {
    const { path } = computerPathSchema.parse({ path: c.req.query("path") });
    return c.json(await computerFiles.read(ctx, c.get("userId"), path));
  });
  app.put("/api/computer/file", async (c) => {
    const { path, text } = computerWriteSchema.parse(await c.req.json());
    return c.json(await computerFiles.write(ctx, c.get("userId"), path, text));
  });
  app.delete("/api/computer/file", async (c) => {
    const { path } = computerPathSchema.parse({ path: c.req.query("path") });
    return c.json(await computerFiles.remove(ctx, c.get("userId"), path));
  });
  app.post("/api/computer/folders", async (c) => {
    const { path } = computerPathSchema.parse(await c.req.json());
    return c.json(await computerFiles.mkdir(ctx, c.get("userId"), path), 201);
  });
  app.post("/api/computer/import", async (c) => {
    const { fileId, path } = computerImportSchema.parse(await c.req.json());
    return c.json(await computerFiles.importFile(ctx, c.get("userId"), fileId, path), 201);
  });
  app.post("/api/computer/export", async (c) => {
    const { path } = computerPathSchema.parse(await c.req.json());
    return c.json(await computerFiles.exportFile(ctx, c.get("userId"), path), 201);
  });
}
