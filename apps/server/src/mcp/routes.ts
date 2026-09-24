import type { Hono } from "hono";
import type { Context } from "../context.ts";
import { AppError } from "../errors.ts";
import { page } from "../providers/routes.ts";
import {
  completeConnectorAuth,
  createConnector,
  deleteConnector,
  listConnectors,
  refreshConnector,
  startConnectorAuth,
  toConnector,
  updateConnector,
} from "./service.ts";

type Env = { Variables: { userId: string } };

/** The OAuth redirect from a connector's authorization server. It carries no bearer token. */
export function publicConnectorRoutes(app: Hono<Env>, ctx: Context) {
  app.get("/api/connectors/oauth/callback", async (c) => {
    c.header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");
    const { state, code, error } = c.req.query();
    if (error || !state || !code)
      return c.html(
        page("Not connected", "The sign-in was cancelled. You can close this window."),
        400,
      );
    try {
      const connector = await completeConnectorAuth(ctx, state, code);
      return c.html(
        page(
          connector.status === "connected" ? `${connector.name} is connected` : "Almost there",
          connector.status === "connected"
            ? `${connector.tools.length} tools are ready. You can close this window and return to Agent V.`
            : (connector.error ?? "Return to Agent V to finish."),
        ),
      );
    } catch (e) {
      return c.html(
        page("Not connected", e instanceof AppError ? e.message : "Something went wrong."),
        400,
      );
    }
  });
}

export function connectorRoutes(app: Hono<Env>, ctx: Context) {
  app.get("/api/connectors", async (c) =>
    c.json((await listConnectors(ctx, c.get("userId"))).map(toConnector)),
  );
  app.post("/api/connectors", async (c) =>
    c.json(await createConnector(ctx, c.get("userId"), await c.req.json()), 201),
  );
  app.patch("/api/connectors/:id", async (c) =>
    c.json(await updateConnector(ctx, c.get("userId"), c.req.param("id"), await c.req.json())),
  );
  app.delete("/api/connectors/:id", async (c) => {
    await deleteConnector(ctx, c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/api/connectors/:id/refresh", async (c) =>
    c.json(await refreshConnector(ctx, c.get("userId"), c.req.param("id"))),
  );
  app.post("/api/connectors/:id/auth", async (c) =>
    c.json(await startConnectorAuth(ctx, c.get("userId"), c.req.param("id"))),
  );
}
