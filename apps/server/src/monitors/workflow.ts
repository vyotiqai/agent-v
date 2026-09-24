import { DBOS } from "@dbos-inc/dbos-sdk";
import { and, eq } from "drizzle-orm";
import type { Context } from "../context.ts";
import { monitors } from "../db/schema.ts";
import { enqueue } from "../queue.ts";
import { dueMonitors, readSource, recordCheck } from "./service.ts";

export const monitorQueue = "monitors";
export const sweepSchedule = "monitor-sweep";

let context: Context | undefined;
export function setMonitorContext(ctx: Context) {
  context = ctx;
}
function ctx(): Context {
  if (!context) throw new Error("Monitor context is not configured");
  return context;
}

/** One check of one watch for one due time. Its workflow id makes each slot run once. */
async function checkFunction(userId: string, id: string, slot: string): Promise<void> {
  const c = ctx();
  const target = await DBOS.runStep(
    async () => {
      const [m] = await c.db
        .select({ url: monitors.url, status: monitors.status, nextCheckAt: monitors.nextCheckAt })
        .from(monitors)
        .where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
      return m?.status === "active" && m.nextCheckAt?.toISOString() === slot ? m.url : null;
    },
    { name: "load" },
  );
  if (!target) return;
  const page = await DBOS.runStep(() => readSource(c, userId, target), { name: "read" });
  await DBOS.runStep(
    async () => {
      await recordCheck(c, userId, id, slot, page);
    },
    { name: "record" },
  );
}
export const monitorCheckWorkflow = DBOS.registerWorkflow(checkFunction, { name: "monitor-check" });

const checkId = (id: string, slot: string) => `monitor:${id}:${slot}`;

/** Queue the check for a due time. Safe to call from requests, steps and repeated calls. */
export async function enqueueCheck(userId: string, id: string, slot: Date) {
  const at = slot.toISOString();
  await enqueue(
    { queue: monitorQueue, workflow: "monitor-check", id: checkId(id, at), user: userId },
    userId,
    id,
    at,
  );
}

/** Runs every minute on every server; the per-slot workflow ids keep checks from doubling. */
async function sweepFunction(_scheduled: Date, _context: unknown): Promise<void> {
  const due = await DBOS.runStep(
    async () =>
      (await dueMonitors(ctx())).map((m) => ({
        id: m.id,
        userId: m.userId,
        slot: m.nextCheckAt?.toISOString() ?? "",
      })),
    { name: "due" },
  );
  for (const m of due)
    if (m.slot)
      await DBOS.startWorkflow(monitorCheckWorkflow, {
        workflowID: checkId(m.id, m.slot),
        queueName: monitorQueue,
        authenticatedUser: m.userId,
      })(m.userId, m.id, m.slot);
}
export const monitorSweep = DBOS.registerWorkflow(sweepFunction, { name: "monitor-sweep" });

export async function startMonitorSchedule() {
  await DBOS.applySchedules([
    { scheduleName: sweepSchedule, workflowFn: monitorSweep, schedule: "* * * * *" },
  ]);
}
