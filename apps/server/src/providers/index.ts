import type { WorkspaceStatus } from "@agent-v/shared";
import type { Context } from "../context.ts";
import { AppError } from "../errors.ts";
import { demoProvider } from "./demo.ts";
import { googleProvider } from "./google/client.ts";
import { getConnection, toConnection } from "./google/oauth.ts";
import type { WorkspaceProvider } from "./types.ts";

/** The user's mail and calendar: their Google account if connected, else the demo workspace. */
export async function workspaceFor(ctx: Context, userId: string): Promise<WorkspaceProvider> {
  const connection = ctx.config.google ? await getConnection(ctx, userId) : null;
  if (connection) return googleProvider(ctx, connection);
  if (ctx.config.demoWorkspace) return demoProvider(ctx, userId);
  throw new AppError("Connect Google in Settings to use mail and calendar", 409);
}

export async function workspaceStatus(ctx: Context, userId: string): Promise<WorkspaceStatus> {
  const connection = ctx.config.google ? await getConnection(ctx, userId) : null;
  if (connection) {
    const c = toConnection(connection);
    return {
      source: "google",
      account: c.account,
      canWrite: c.capability === "write",
      googleAvailable: true,
      connection: c,
    };
  }
  return {
    source: ctx.config.demoWorkspace ? "demo" : "none",
    account: ctx.config.demoWorkspace ? "you@demo.agent-v" : null,
    canWrite: ctx.config.demoWorkspace,
    googleAvailable: Boolean(ctx.config.google),
    connection: null,
  };
}
