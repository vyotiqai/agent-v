import { currencies } from "@agent-v/shared";
import { z } from "zod";
import type { Context } from "../context.ts";
import { AppError } from "../errors.ts";
import { financeSummary } from "../finance/service.ts";
import { addMilestones, createGoal, listGoals } from "../goals/service.ts";
import { createMonitor, listMonitors } from "../monitors/service.ts";

export const lifeSchemas = {
  create_goal: z.object({
    title: z.string().min(1).max(160),
    description: z.string().max(4000).optional(),
    category: z.string().max(80).optional(),
    milestones: z.array(z.string().min(1).max(200)).max(12).optional(),
  }),
  add_goal_milestones: z.object({
    goalId: z.string().uuid().optional().describe("Defaults to the goal this task belongs to"),
    milestones: z.array(z.string().min(1).max(200)).min(1).max(12),
  }),
  goal_status: z.object({}),
  watch_page: z.object({
    title: z.string().min(1).max(160),
    url: z.string().min(1).max(4096),
    condition: z.enum(["change", "contains", "price_below"]),
    value: z
      .string()
      .max(300)
      .optional()
      .describe("Text to wait for (contains) or the price threshold (price_below)"),
    currency: z.enum(currencies).optional(),
    intervalMinutes: z.number().int().min(5).max(10_080).optional(),
  }),
  finance_summary: z.object({
    filter: z
      .string()
      .max(100)
      .optional()
      .describe("A category or merchant to total, for example Dining or Netflix"),
  }),
};
export type LifeTool = keyof typeof lifeSchemas;

export const lifeDescriptions: Record<LifeTool, string> = {
  create_goal:
    "Save a goal the owner wants to work toward, optionally with concrete milestones. Goals are outcomes; tasks do the work.",
  add_goal_milestones:
    "Add concrete, checkable milestones to a goal (for planning tasks, the task's own goal).",
  goal_status: "List the owner's goals with milestone progress, and their page watches.",
  watch_page:
    "Start a recurring check of a public page for the owner: any change, some text appearing, or a price dropping below a threshold. The owner is notified when it happens. It only reads the page.",
  finance_summary:
    "Summarize the owner's newest imported transactions (income, spending, categories, months, recurring charges), optionally totalling one category or merchant.",
};

export async function runLifeTool(
  ctx: Context,
  userId: string,
  name: LifeTool,
  input: unknown,
  scope: { goalId?: string | null } = {},
): Promise<unknown> {
  try {
    switch (name) {
      case "create_goal": {
        const data = lifeSchemas.create_goal.parse(input);
        const goal = await createGoal(ctx, userId, data);
        return { id: goal.id, title: goal.title, milestones: goal.milestones.map((m) => m.title) };
      }
      case "add_goal_milestones": {
        const data = lifeSchemas.add_goal_milestones.parse(input);
        const goalId = data.goalId ?? scope.goalId;
        if (!goalId) return { error: "This task has no goal; pass goalId" };
        const goal = await addMilestones(ctx, userId, goalId, data.milestones);
        return { id: goal.id, title: goal.title, milestones: goal.milestones.map((m) => m.title) };
      }
      case "goal_status": {
        const [goals, watches] = await Promise.all([
          listGoals(ctx, userId),
          listMonitors(ctx, userId),
        ]);
        return {
          goals: goals.slice(0, 30).map((g) => ({
            id: g.id,
            title: g.title,
            status: g.status,
            done: g.milestones.filter((m) => m.done).length,
            milestones: g.milestones.map((m) => `${m.done ? "[x]" : "[ ]"} ${m.title}`),
          })),
          watches: watches
            .filter((w) => w.status !== "stopped")
            .slice(0, 30)
            .map((w) => ({
              id: w.id,
              title: w.title,
              url: w.url,
              condition: w.condition,
              value: w.value,
              status: w.status,
              matched: w.matched,
              lastPrice: w.lastPrice,
              lastCheckedAt: w.lastCheckedAt,
              error: w.error,
            })),
        };
      }
      case "watch_page": {
        const data = lifeSchemas.watch_page.parse(input);
        const monitor = await createMonitor(ctx, userId, {
          ...data,
          value: data.value ?? "",
          currency: data.currency ?? null,
          intervalMinutes: data.intervalMinutes ?? 60,
          goalId: scope.goalId ?? null,
        });
        return {
          id: monitor.id,
          title: monitor.title,
          url: monitor.url,
          condition: monitor.condition,
          value: monitor.value,
          intervalMinutes: monitor.intervalMinutes,
        };
      }
      case "finance_summary": {
        const data = lifeSchemas.finance_summary.parse(input);
        return financeSummary(ctx, userId, data.filter);
      }
    }
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    if (error instanceof z.ZodError)
      return { error: error.issues.map((i) => i.message).join("; ") };
    throw error;
  }
}
