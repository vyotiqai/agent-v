import type { Goal, GoalUpdate, Milestone, Monitor, Task } from "@agent-v/shared";
import { goalInputSchema, goalUpdateSchema } from "@agent-v/shared";
import { and, desc, eq } from "drizzle-orm";
import { type Context, newId } from "../context.ts";
import { goals, monitors, tasks } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";
import { toMonitor } from "../monitors/service.ts";
import { createTask, toTask } from "../tasks/service.ts";

const maxGoals = 100;

export const toGoal = (row: typeof goals.$inferSelect): Goal => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  status: row.status,
  milestones: row.milestones,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

async function getGoalRow(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!row) throw notFound("Goal");
  return row;
}

export async function listGoals(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .orderBy(desc(goals.updatedAt))
    .limit(maxGoals);
  return rows.map(toGoal);
}

export async function getGoalDetail(
  ctx: Context,
  userId: string,
  id: string,
): Promise<{ goal: Goal; tasks: Task[]; monitors: Monitor[] }> {
  const row = await getGoalRow(ctx, userId, id);
  const [taskRows, monitorRows] = await Promise.all([
    ctx.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.goalId, id), eq(tasks.userId, userId)))
      .orderBy(desc(tasks.updatedAt))
      .limit(100),
    ctx.db
      .select()
      .from(monitors)
      .where(and(eq(monitors.goalId, id), eq(monitors.userId, userId)))
      .orderBy(desc(monitors.createdAt))
      .limit(100),
  ]);
  return { goal: toGoal(row), tasks: taskRows.map(toTask), monitors: monitorRows.map(toMonitor) };
}

const milestone = (title: string, done = false): Milestone => ({
  id: newId().slice(0, 8),
  title,
  done,
  taskId: null,
});

export async function createGoal(ctx: Context, userId: string, raw: unknown) {
  const input = goalInputSchema.parse(raw);
  const existing = await ctx.db.$count(goals, eq(goals.userId, userId));
  if (existing >= maxGoals) throw new AppError(`Keep at most ${maxGoals} goals`, 429);
  const [row] = await ctx.db
    .insert(goals)
    .values({
      id: newId(),
      userId,
      title: input.title,
      description: input.description,
      category: input.category || "Personal",
      milestones: input.milestones.map((t) => milestone(t)),
    })
    .returning();
  if (!row) throw new AppError("The goal could not be saved", 500);
  await ctx.realtime.publish(userId, { type: "goal", id: row.id });
  return toGoal(row);
}

/** Change a goal under a row lock, so milestone updates from tasks and people never race. */
async function mutateGoal(
  ctx: Context,
  userId: string,
  id: string,
  change: (goal: typeof goals.$inferSelect) => Partial<typeof goals.$inferInsert> | null,
) {
  const row = await ctx.db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
      .for("update");
    if (!current) throw notFound("Goal");
    const patch = change(current);
    if (!patch) return current;
    const [updated] = await tx.update(goals).set(patch).where(eq(goals.id, id)).returning();
    return updated ?? current;
  });
  await ctx.realtime.publish(userId, { type: "goal", id });
  return toGoal(row);
}

export async function updateGoal(ctx: Context, userId: string, id: string, raw: GoalUpdate) {
  const input = goalUpdateSchema.parse(raw);
  return mutateGoal(ctx, userId, id, (goal) => {
    const byId = new Map(goal.milestones.map((m) => [m.id, m]));
    return {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category || "Personal" }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.milestones && {
        // Existing milestones keep their id and linked task; new ones get an id.
        milestones: input.milestones.map((m) => {
          const known = m.id ? byId.get(m.id) : undefined;
          return known
            ? { ...known, title: m.title, done: m.done }
            : { ...milestone(m.title, m.done) };
        }),
      }),
    };
  });
}

export async function deleteGoal(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .returning({ id: goals.id });
  if (!row) throw notFound("Goal");
  await ctx.realtime.publish(userId, { type: "goal", id });
}

export async function addMilestones(ctx: Context, userId: string, id: string, titles: string[]) {
  return mutateGoal(ctx, userId, id, (goal) => {
    const known = new Set(goal.milestones.map((m) => m.title.toLowerCase()));
    const fresh = titles
      .map((t) => t.trim())
      .filter((t) => t && !known.has(t.toLowerCase()))
      .map((t) => milestone(t.slice(0, 200)));
    if (!fresh.length) return null;
    if (goal.milestones.length + fresh.length > 30)
      throw new AppError("A goal can have at most 30 milestones", 422);
    return { milestones: [...goal.milestones, ...fresh] };
  });
}

/** Start a task that works on a goal, or on one of its milestones. */
export async function startGoalWork(
  ctx: Context,
  userId: string,
  id: string,
  input: { milestoneId?: string; prompt?: string },
) {
  const goal = await getGoalRow(ctx, userId, id);
  const target = input.milestoneId
    ? goal.milestones.find((m) => m.id === input.milestoneId)
    : undefined;
  if (input.milestoneId && !target) throw notFound("Milestone");
  const about = goal.description ? ` Context: ${goal.description}` : "";
  const prompt =
    input.prompt ??
    (target
      ? `Work toward my goal "${goal.title}" by completing this milestone: ${target.title}.${about}`
      : goal.milestones.length
        ? `Help me make progress on my goal "${goal.title}". Pick the next open milestone and do it.${about}`
        : `Make a plan for my goal "${goal.title}": break it into 3-6 concrete milestones and save them with add_goal_milestones.${about}`);
  const task = await createTask(ctx, userId, {
    prompt,
    title: target ? target.title : goal.milestones.length ? goal.title : `Plan: ${goal.title}`,
    goalId: goal.id,
    milestoneId: target?.id,
  });
  if (target)
    await mutateGoal(ctx, userId, id, (g) => ({
      milestones: g.milestones.map((m) => (m.id === target.id ? { ...m, taskId: task.id } : m)),
    }));
  return task;
}

/**
 * Record a finished task on its goal: its milestone is checked off, or the task is added as a
 * completed milestone. Safe to repeat (a replayed workflow step changes nothing).
 */
export async function recordGoalProgress(ctx: Context, userId: string, taskId: string) {
  const [task] = await ctx.db
    .select({
      goalId: tasks.goalId,
      milestoneId: tasks.milestoneId,
      title: tasks.title,
      prompt: tasks.prompt,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  if (!task?.goalId) return;
  await mutateGoal(ctx, userId, task.goalId, (goal) => {
    const own = goal.milestones.find(
      (m) => m.id === task.milestoneId || (m.taskId === taskId && !task.milestoneId),
    );
    if (own) {
      if (own.done && own.taskId === taskId) return null;
      return {
        milestones: goal.milestones.map((m) =>
          m.id === own.id ? { ...m, done: true, taskId } : m,
        ),
      };
    }
    // Planning tasks add milestones rather than being one.
    if (task.prompt.includes("add_goal_milestones")) return null;
    if (goal.milestones.length >= 30) return null;
    return { milestones: [...goal.milestones, { ...milestone(task.title, true), taskId }] };
  }).catch((error) => {
    if (!(error instanceof AppError && error.status === 404)) throw error;
  });
}
