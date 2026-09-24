import { z } from "zod";

/** Chat messages use the AG-UI 1.0 message shape so any AG-UI client can replay a thread. */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content?: string; toolCalls?: ToolCall[] }
  | { id: string; role: "tool"; content: string; toolCallId: string; error?: string };

export interface Thread {
  id: string;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export const taskStatuses = [
  "queued",
  "running",
  "waiting_input",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export const activeTaskStatuses: readonly TaskStatus[] = [
  "queued",
  "running",
  "waiting_input",
  "waiting_approval",
];

export interface PlanStep {
  id: string;
  title: string;
  status: "pending" | "active" | "done" | "skipped";
}

export interface Task {
  id: string;
  threadId: string | null;
  title: string;
  prompt: string;
  status: TaskStatus;
  plan: PlanStep[];
  question: string | null;
  actionId: string | null;
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskEventKind = "status" | "step" | "tool" | "result" | "error";
export interface TaskEvent {
  id: string;
  taskId: string;
  kind: TaskEventKind;
  title: string;
  detail: string;
  createdAt: string;
}

export type ActionStatus =
  | "awaiting_review"
  | "approved"
  | "executing"
  | "succeeded"
  | "failed"
  | "denied"
  | "expired"
  | "outcome_unknown";
export interface Action {
  id: string;
  taskId: string | null;
  kind: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  hash: string;
  status: ActionStatus;
  result: string | null;
  error: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface Memory {
  id: string;
  text: string;
  source: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** A persistent cloud browser owned by one user, optionally tied to a chat or task. */
export interface BrowserSession {
  id: string;
  threadId: string | null;
  taskId: string | null;
  url: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Signed, short-lived link to a JPEG of the current page. */
  screenshotUrl: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface Settings {
  model: string;
  agentName: string;
  tone: string;
}

/** Pushed on GET /api/events whenever something the user owns changes. */
export interface WorkspaceEvent {
  type: "task" | "thread" | "notification" | "memory" | "action" | "settings" | "browser";
  id: string;
}

export interface TaskDetail {
  task: Task;
  events: TaskEvent[];
  action: Action | null;
}

// Request schemas, shared by the server (validation) and the app (typed calls).
const text = (max: number) => z.string().trim().min(1).max(max);

export const createThreadSchema = z.object({ title: text(200).optional() });
export const updateThreadSchema = z.object({
  title: text(200).optional(),
  archived: z.boolean().optional(),
});
export const runInputSchema = z.object({
  messageId: z.string().min(1).max(100).optional(),
  content: text(32_000),
  model: z.string().min(3).max(200).optional(),
});
export const createTaskSchema = z.object({
  prompt: text(12_000),
  title: text(160).optional(),
  threadId: z.string().uuid().optional(),
});
export const taskControlSchema = z.object({ action: z.enum(["cancel", "retry"]) });
export const taskAnswerSchema = z.object({ answer: text(12_000) });
export const actionDecisionSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["approve", "deny"]),
});
export const browserOpenSchema = z.object({ url: z.string().trim().min(1).max(8192) });
export const memoryInputSchema = z.object({ text: text(2000) });
export const settingsInputSchema = z.object({
  model: z.string().min(3).max(200).optional(),
  agentName: text(60).optional(),
  tone: text(60).optional(),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;
export type RunInput = z.infer<typeof runInputSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type SettingsInput = z.infer<typeof settingsInputSchema>;
