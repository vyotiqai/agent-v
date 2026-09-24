import {
  demoPageSchema,
  financeImportSchema,
  goalInputSchema,
  goalUpdateSchema,
  goalWorkSchema,
  ideaDecisionSchema,
  monitorControlSchema,
  monitorInputSchema,
  savingsGoalSchema,
} from "@agent-v/shared";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";
import type { Context } from "../context.ts";
import { sampleTransactionsCsv } from "../finance/analyze.ts";
import {
  createSavingsGoal,
  deleteReport,
  getReport,
  importTransactions,
  listReports,
} from "../finance/service.ts";
import { decideIdea, listIdeas, refreshIdeas } from "../ideas/service.ts";
import {
  controlMonitor,
  createMonitor,
  deleteMonitor,
  getDemoPage,
  getMonitorDetail,
  listMonitors,
  setDemoPage,
} from "../monitors/service.ts";
import {
  createGoal,
  deleteGoal,
  getGoalDetail,
  listGoals,
  startGoalWork,
  updateGoal,
} from "./service.ts";

type Env = { Variables: { userId: string } };
const body = async <T extends z.ZodType>(c: { req: { json(): Promise<unknown> } }, schema: T) =>
  schema.parse(await c.req.json()) as z.output<T>;

/** Goals, page watches, ideas and money. */
export function lifeRoutes(app: Hono<Env>, ctx: Context) {
  app.get("/api/goals", async (c) => c.json(await listGoals(ctx, c.get("userId"))));
  app.post("/api/goals", async (c) =>
    c.json(await createGoal(ctx, c.get("userId"), await body(c, goalInputSchema)), 201),
  );
  app.get("/api/goals/:id", async (c) =>
    c.json(await getGoalDetail(ctx, c.get("userId"), c.req.param("id"))),
  );
  app.patch("/api/goals/:id", async (c) =>
    c.json(
      await updateGoal(ctx, c.get("userId"), c.req.param("id"), await body(c, goalUpdateSchema)),
    ),
  );
  app.delete("/api/goals/:id", async (c) => {
    await deleteGoal(ctx, c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/api/goals/:id/work", async (c) =>
    c.json(
      await startGoalWork(ctx, c.get("userId"), c.req.param("id"), await body(c, goalWorkSchema)),
      201,
    ),
  );

  app.get("/api/monitors", async (c) => c.json(await listMonitors(ctx, c.get("userId"))));
  app.post("/api/monitors", async (c) =>
    c.json(await createMonitor(ctx, c.get("userId"), await body(c, monitorInputSchema)), 201),
  );
  app.get("/api/monitors/:id", async (c) =>
    c.json(await getMonitorDetail(ctx, c.get("userId"), c.req.param("id"))),
  );
  app.post("/api/monitors/:id/control", async (c) => {
    const { action } = await body(c, monitorControlSchema);
    return c.json(await controlMonitor(ctx, c.get("userId"), c.req.param("id"), action));
  });
  app.delete("/api/monitors/:id", async (c) => {
    await deleteMonitor(ctx, c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.get("/api/demo-pages/:slug", async (c) =>
    c.json(await getDemoPage(ctx, c.get("userId"), c.req.param("slug"))),
  );
  app.put("/api/demo-pages/:slug", async (c) => {
    const { text } = await body(c, demoPageSchema);
    return c.json(await setDemoPage(ctx, c.get("userId"), c.req.param("slug"), text));
  });

  app.get("/api/ideas", async (c) =>
    c.json(await listIdeas(ctx, c.get("userId"), { refresh: c.req.query("refresh") === "1" })),
  );
  app.post("/api/ideas/refresh", async (c) => {
    await refreshIdeas(ctx, c.get("userId"));
    return c.json(await listIdeas(ctx, c.get("userId")));
  });
  app.post("/api/ideas/:id/decide", async (c) => {
    const { action, prompt } = await body(c, ideaDecisionSchema);
    return c.json(await decideIdea(ctx, c.get("userId"), c.req.param("id"), action, prompt));
  });

  app.get("/api/finance", async (c) => c.json(await listReports(ctx, c.get("userId"))));
  app.post("/api/finance/import", bodyLimit({ maxSize: 2 * 1024 * 1024 }), async (c) =>
    c.json(await importTransactions(ctx, c.get("userId"), await body(c, financeImportSchema)), 201),
  );
  app.post("/api/finance/sample", async (c) =>
    c.json(
      await importTransactions(ctx, c.get("userId"), {
        name: "Example transactions",
        csv: sampleTransactionsCsv(),
      }),
      201,
    ),
  );
  app.get("/api/finance/:id", async (c) =>
    c.json(await getReport(ctx, c.get("userId"), c.req.param("id"))),
  );
  app.delete("/api/finance/:id", async (c) => {
    await deleteReport(ctx, c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/api/finance/:id/goal", async (c) => {
    const { monthlyTarget } = await body(c, savingsGoalSchema);
    return c.json(
      await createSavingsGoal(ctx, c.get("userId"), c.req.param("id"), monthlyTarget),
      201,
    );
  });
}
