import {
  activeTaskStatuses,
  type CreateTaskInput,
  type PlanStep,
  type Task,
  type TaskDetail,
  type TaskEvent,
  type TaskEventKind,
} from "@agent-v/shared";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { and, asc, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { getAction } from "../actions.ts";
import { assertQuota, recordUsage } from "../billing/usage.ts";
import { type Context, newId } from "../context.ts";
import { goals, taskEvents, tasks, threads } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";
import { getSettings } from "../workspace.ts";
import { taskQueue, taskWorkflow } from "./workflow.ts";

const maxActiveTasks = 50;

export const toTask = (row: typeof tasks.$inferSelect): Task => ({
  id: row.id,
  threadId: row.threadId,
  goalId: row.goalId,
  title: row.title,
  prompt: row.prompt,
  status: row.status,
  plan: row.plan,
  question: row.question,
  actionId: row.actionId,
  result: row.result,
  error: row.error,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toEvent = (row: typeof taskEvents.$inferSelect): TaskEvent => ({
  id: row.id,
  taskId: row.taskId,
  kind: row.kind,
  title: row.title,
  detail: row.detail,
  createdAt: row.createdAt.toISOString(),
});

export async function getTaskRow(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (!row) throw notFound("Task");
  return row;
}

export async function listTasks(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.updatedAt))
    .limit(200);
  return rows.map(toTask);
}

export async function getTaskDetail(ctx: Context, userId: string, id: string): Promise<TaskDetail> {
  const row = await getTaskRow(ctx, userId, id);
  const events = await ctx.db
    .select()
    .from(taskEvents)
    .where(and(eq(taskEvents.taskId, id), eq(taskEvents.userId, userId)))
    .orderBy(asc(taskEvents.createdAt))
    .limit(500);
  return {
    task: toTask(row),
    events: events.map(toEvent),
    action: row.actionId ? await getAction(ctx, userId, row.actionId) : null,
  };
}

function titleFor(prompt: string) {
  const first =
    prompt
      .replace(/\s+/g, " ")
      .trim()
      .split(/[.!?\n]/)[0] ?? prompt;
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first || "New task";
}

/**
 * Create a task and start its workflow. With `options.id` the call is idempotent: creating the
 * same id again returns the existing task instead of starting a second one.
 */
export async function createTask(
  ctx: Context,
  userId: string,
  input: CreateTaskInput,
  options: { id?: string } = {},
) {
  if (options.id) {
    const [existing] = await ctx.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, options.id), eq(tasks.userId, userId)));
    if (existing) {
      // A crash may have come between saving the task and starting it; starting a workflow
      // id that already exists is a no-op.
      if (existing.status === "queued")
        await DBOS.startWorkflow(taskWorkflow, {
          workflowID: existing.workflowId,
          queueName: taskQueue,
          authenticatedUser: userId,
        })(userId, existing.id);
      return toTask(existing);
    }
  }
  await assertQuota(ctx, userId, "tasks");
  const [active] = await ctx.db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.status, [...activeTaskStatuses])));
  if ((active?.n ?? 0) >= maxActiveTasks)
    throw new AppError("Too many tasks are running. Finish or cancel some first.", 429);
  if (input.threadId) {
    const [thread] = await ctx.db
      .select({ id: threads.id })
      .from(threads)
      .where(and(eq(threads.id, input.threadId), eq(threads.userId, userId)));
    if (!thread) throw notFound("Thread");
  }
  if (input.goalId) {
    const [goal] = await ctx.db
      .select({ milestones: goals.milestones })
      .from(goals)
      .where(and(eq(goals.id, input.goalId), eq(goals.userId, userId)));
    if (!goal) throw notFound("Goal");
    if (input.milestoneId && !goal.milestones.some((m) => m.id === input.milestoneId))
      throw notFound("Milestone");
  } else if (input.milestoneId) throw new AppError("A milestone needs its goal", 422);
  const { model } = await getSettings(ctx, userId);
  const id = options.id ?? newId();
  const [row] = await ctx.db
    .insert(tasks)
    .values({
      id,
      userId,
      threadId: input.threadId,
      goalId: input.goalId,
      milestoneId: input.milestoneId,
      title: input.title ?? titleFor(input.prompt),
      prompt: input.prompt,
      model,
      workflowId: id,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    // Lost a race with an identical request; that request starts the workflow.
    if (options.id) return toTask(await getTaskRow(ctx, userId, options.id));
    throw new AppError("Task could not be created", 500);
  }
  await recordUsage(ctx, userId, { tasks: 1 });
  await addEvent(ctx, userId, id, "status", "Queued");
  await DBOS.startWorkflow(taskWorkflow, {
    workflowID: id,
    queueName: taskQueue,
    authenticatedUser: userId,
  })(userId, id);
  await ctx.realtime.publish(userId, { type: "task", id });
  return toTask(row);
}

export async function addEvent(
  ctx: Context,
  userId: string,
  taskId: string,
  kind: TaskEventKind,
  title: string,
  detail = "",
) {
  await ctx.db
    .insert(taskEvents)
    .values({ id: newId(), taskId, userId, kind, title, detail: detail.slice(0, 4000) });
}

/**
 * Update a task from its workflow. Terminal states set by the owner (cancelled) are never
 * overwritten by a workflow that is still unwinding.
 */
export async function updateTask(
  ctx: Context,
  userId: string,
  id: string,
  patch: Partial<Pick<Task, "status" | "question" | "actionId" | "result" | "error">> & {
    plan?: PlanStep[];
  },
  event?: { kind: TaskEventKind; title: string; detail?: string },
) {
  const [row] = await ctx.db
    .update(tasks)
    .set(patch)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), notInArray(tasks.status, ["cancelled"])))
    .returning();
  if (row && event) await addEvent(ctx, userId, id, event.kind, event.title, event.detail);
  await ctx.realtime.publish(userId, { type: "task", id });
  return row ? toTask(row) : null;
}

export async function answerTask(ctx: Context, userId: string, id: string, answer: string) {
  const row = await getTaskRow(ctx, userId, id);
  if (row.status !== "waiting_input") throw new AppError("This task is not waiting for input", 409);
  await DBOS.send(row.workflowId, { answer }, "input");
  await addEvent(ctx, userId, id, "step", "You answered", answer);
  await ctx.realtime.publish(userId, { type: "task", id });
  return toTask(row);
}

export async function cancelTask(ctx: Context, userId: string, id: string) {
  const row = await getTaskRow(ctx, userId, id);
  if (!activeTaskStatuses.includes(row.status))
    throw new AppError("Only unfinished tasks can be cancelled", 409);
  await DBOS.cancelWorkflow(row.workflowId);
  // The question and pending action are kept so a resumed task returns to the same wait.
  const [updated] = await ctx.db
    .update(tasks)
    .set({ status: "cancelled" })
    .where(eq(tasks.id, id))
    .returning();
  await addEvent(ctx, userId, id, "status", "Cancelled");
  await ctx.realtime.publish(userId, { type: "task", id });
  return toTask(updated ?? row);
}

/**
 * Continue a failed or cancelled task. Completed steps are reused from their checkpoints, so
 * nothing already done (including approved external writes) runs twice.
 */
export async function retryTask(ctx: Context, userId: string, id: string) {
  const row = await getTaskRow(ctx, userId, id);
  if (row.status !== "failed" && row.status !== "cancelled")
    throw new AppError("Only failed or cancelled tasks can be retried", 409);
  let workflowId = row.workflowId;
  if (row.status === "cancelled") {
    const status = row.question ? "waiting_input" : row.actionId ? "waiting_approval" : "queued";
    await ctx.db.update(tasks).set({ status, error: null }).where(eq(tasks.id, id));
    await DBOS.resumeWorkflow(workflowId, { queueName: taskQueue });
  } else {
    const steps = (await DBOS.listWorkflowSteps(workflowId)) ?? [];
    const failed = steps.find((s) => s.error);
    const last = steps.reduce((max, s) => Math.max(max, s.functionID), 0);
    workflowId = `${id}:${newId().slice(0, 8)}`;
    await ctx.db
      .update(tasks)
      .set({ status: "queued", error: null, workflowId })
      .where(eq(tasks.id, id));
    await DBOS.forkWorkflow(row.workflowId, failed?.functionID ?? last, {
      newWorkflowID: workflowId,
      queueName: taskQueue,
    });
  }
  await addEvent(ctx, userId, id, "status", "Retrying");
  await ctx.realtime.publish(userId, { type: "task", id });
  return toTask(await getTaskRow(ctx, userId, id));
}
