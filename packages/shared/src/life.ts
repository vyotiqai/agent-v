import { z } from "zod";

// Goals: outcomes the owner is working toward. Tasks and watches can belong to a goal.
export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  /** The task that completed (or is working on) this milestone. */
  taskId: string | null;
}
export type GoalStatus = "active" | "paused" | "completed";
export interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  status: GoalStatus;
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
}

// Watches: recurring checks of a public page.
export type MonitorCondition = "change" | "contains" | "price_below";
export type MonitorStatus = "active" | "paused" | "stopped";
export interface Monitor {
  id: string;
  title: string;
  url: string;
  condition: MonitorCondition;
  /** Text to look for, or the price threshold. Empty for `change`. */
  value: string;
  /** Only prices in this currency count toward `price_below` (null: any currency). */
  currency: string | null;
  intervalMinutes: number;
  status: MonitorStatus;
  goalId: string | null;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  /** The start of the page text from the last successful check. */
  lastExcerpt: string;
  /** Lowest matching price seen on the last check (price watches only). */
  lastPrice: number | null;
  /** Whether the condition held on the last check; alerts fire when it becomes true. */
  matched: boolean;
  failures: number;
  error: string | null;
  checks: number;
  createdAt: string;
}
export type MonitorOutcome = "baseline" | "unchanged" | "changed" | "matched" | "waiting" | "error";
export interface MonitorCheck {
  id: string;
  monitorId: string;
  outcome: MonitorOutcome;
  detail: string;
  price: number | null;
  createdAt: string;
}
export interface MonitorDetail {
  monitor: Monitor;
  checks: MonitorCheck[];
}

// Ideas: suggestions the agent could take on, each with the evidence behind it.
export interface Evidence {
  kind: "mail" | "event" | "goal" | "task" | "monitor" | "finance";
  id: string;
  title: string;
  excerpt: string;
  date: string | null;
}
export type IdeaStatus = "new" | "accepted" | "dismissed";
export interface Idea {
  id: string;
  kind: "paperwork" | "reply" | "event" | "plan" | "watch" | "finance";
  title: string;
  reason: string;
  prompt: string;
  evidence: Evidence[];
  status: IdeaStatus;
  goalId: string | null;
  taskId: string | null;
  createdAt: string;
}

// Finance: spending summaries from imported transaction CSV.
export type AmountConvention = "expenses_positive" | "expenses_negative" | "debit_credit";
export interface Transaction {
  date: string;
  description: string;
  /** Positive is money spent, negative is money received, whatever the source file used. */
  amount: number;
  category: string;
  merchant: string;
}
export interface FinanceReport {
  id: string;
  name: string;
  currency: string | null;
  convention: AmountConvention;
  period: { from: string; to: string };
  count: number;
  income: number;
  spending: number;
  net: number;
  categories: { name: string; amount: number; share: number }[];
  months: { month: string; income: number; spending: number }[];
  merchants: { name: string; amount: number; count: number }[];
  recurring: { merchant: string; amount: number; months: number; category: string }[];
  warnings: string[];
  goalId: string | null;
  createdAt: string;
}
export interface FinanceReportDetail {
  report: FinanceReport;
  transactions: Transaction[];
}

const text = (max: number) => z.string().trim().min(1).max(max);

export const goalInputSchema = z.object({
  title: text(160),
  description: z.string().trim().max(4000).default(""),
  category: z.string().trim().max(80).default("Personal"),
  milestones: z.array(text(200)).max(30).default([]),
});
export const goalUpdateSchema = z.object({
  title: text(160).optional(),
  description: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(80).optional(),
  status: z.enum(["active", "paused", "completed"]).optional(),
  milestones: z
    .array(
      z.object({
        id: z.string().min(1).max(64).optional(),
        title: text(200),
        done: z.boolean().default(false),
      }),
    )
    .max(30)
    .optional(),
});
/** Start a task for a goal, optionally to complete one of its milestones. */
export const goalWorkSchema = z.object({
  milestoneId: z.string().min(1).max(64).optional(),
  prompt: text(12_000).optional(),
});

export const currencies = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD"] as const;
export const monitorInputSchema = z
  .object({
    title: text(160),
    url: z.string().trim().min(1).max(4096),
    condition: z.enum(["change", "contains", "price_below"]).default("change"),
    value: z.string().trim().max(300).default(""),
    currency: z.enum(currencies).nullable().default(null),
    intervalMinutes: z
      .number()
      .int()
      .min(5)
      .max(7 * 24 * 60)
      .default(60),
    goalId: z.string().uuid().nullable().default(null),
  })
  .superRefine((v, c) => {
    if (v.condition !== "change" && !v.value)
      c.addIssue({ code: "custom", path: ["value"], message: "Enter what to look for" });
    if (v.condition === "price_below" && !(Number(v.value) > 0))
      c.addIssue({ code: "custom", path: ["value"], message: "Enter a price above zero" });
  });
export const monitorControlSchema = z.object({
  action: z.enum(["pause", "resume", "stop", "check"]),
});
export const demoPageSchema = z.object({ text: z.string().max(20_000) });

export const ideaDecisionSchema = z.object({
  action: z.enum(["accept", "dismiss"]),
  prompt: text(12_000).optional(),
});

export const financeImportSchema = z.object({
  name: text(120).default("Transactions"),
  csv: z.string().min(1).max(1_000_000),
  signs: z.enum(["auto", "expenses_positive", "expenses_negative"]).default("auto"),
});
export const savingsGoalSchema = z.object({
  monthlyTarget: z.number().positive().max(1e9),
});

export type GoalInput = z.input<typeof goalInputSchema>;
export type GoalUpdate = z.input<typeof goalUpdateSchema>;
export type MonitorInput = z.input<typeof monitorInputSchema>;
export type FinanceImport = z.input<typeof financeImportSchema>;
