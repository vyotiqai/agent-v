import type { Hono } from "hono";
import type { Context } from "../context.ts";
import {
  getPreferences,
  listDevices,
  pushStatus,
  registerDevice,
  removeDevice,
  sendTest,
  updatePreferences,
} from "./service.ts";

type Env = { Variables: { userId: string } };

export function pushRoutes(app: Hono<Env>, ctx: Context) {
  app.get("/api/push", async (c) => {
    const userId = c.get("userId");
    return c.json({
      ...pushStatus(ctx),
      preferences: await getPreferences(ctx, userId),
      devices: await listDevices(ctx, userId),
    });
  });
  app.patch("/api/push/preferences", async (c) =>
    c.json(await updatePreferences(ctx, c.get("userId"), await c.req.json())),
  );
  app.post("/api/push/devices", async (c) =>
    c.json(await registerDevice(ctx, c.get("userId"), await c.req.json()), 201),
  );
  app.delete("/api/push/devices/:id", async (c) => {
    await removeDevice(ctx, c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/api/push/test", async (c) => c.json(await sendTest(ctx, c.get("userId"))));
}
