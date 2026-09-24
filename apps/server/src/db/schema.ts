import type {
  ActionStatus,
  AmountConvention,
  Evidence,
  FinanceReport,
  GoalStatus,
  IdeaStatus,
  Milestone,
  MonitorCondition,
  MonitorOutcome,
  MonitorStatus,
  PdfField,
  PlanStep,
  TaskEventKind,
  TaskStatus,
  ToolCall,
  Transaction,
} from "@agent-v/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { DemoWorkspaceData } from "../providers/demo.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// Better Auth core tables. Property names are the model fields Better Auth expects.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// Application tables. Every row is owned by exactly one user.
const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const settings = pgTable("settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  model: text("model"),
  agentName: text("agent_name").notNull().default("Agent V"),
  tone: text("tone").notNull().default("warm and concise"),
  ideasRefreshedAt: timestamp("ideas_refreshed_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull(),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("threads_user_updated_idx").on(t.userId, t.updatedAt.desc())],
);

export const messages = pgTable(
  "messages",
  {
    seq: bigint("seq", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    id: text("id").notNull(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: owner(),
    role: text("role").$type<"user" | "assistant" | "tool">().notNull(),
    content: text("content"),
    toolCalls: jsonb("tool_calls").$type<ToolCall[]>(),
    toolCallId: text("tool_call_id"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("messages_thread_id_idx").on(t.threadId, t.id),
    index("messages_thread_seq_idx").on(t.threadId, t.seq),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    threadId: text("thread_id").references(() => threads.id, { onDelete: "set null" }),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
    /** The goal milestone this task completes when it succeeds. */
    milestoneId: text("milestone_id"),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    model: text("model").notNull(),
    /** DBOS workflow currently executing this task; a retry forks a new one. */
    workflowId: text("workflow_id").notNull(),
    status: text("status").$type<TaskStatus>().notNull().default("queued"),
    plan: jsonb("plan").$type<PlanStep[]>().notNull().default(sql`'[]'::jsonb`),
    question: text("question"),
    actionId: text("action_id"),
    result: text("result"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_user_updated_idx").on(t.userId, t.updatedAt.desc()),
    index("tasks_goal_idx").on(t.goalId),
  ],
);

export const taskEvents = pgTable(
  "task_events",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: owner(),
    kind: text("kind").$type<TaskEventKind>().notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("task_events_task_idx").on(t.taskId, t.createdAt)],
);

export const actions = pgTable(
  "actions",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    hash: text("hash").notNull(),
    status: text("status").$type<ActionStatus>().notNull().default("awaiting_review"),
    result: text("result"),
    error: text("error"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("actions_user_status_idx").on(t.userId, t.status)],
);

export const memories = pgTable(
  "memories",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    text: text("text").notNull(),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("memories_user_idx").on(t.userId, t.createdAt.desc())],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    /** An app path to open, for notifications about something other than a task. */
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt.desc()),
    uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey),
  ],
);

export const browserSessions = pgTable(
  "browser_sessions",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    threadId: text("thread_id").references(() => threads.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    url: text("url").notNull().default(""),
    title: text("title").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("browser_sessions_user_idx").on(t.userId, t.updatedAt.desc()),
    uniqueIndex("browser_sessions_thread_idx").on(t.threadId),
    uniqueIndex("browser_sessions_task_idx").on(t.taskId),
  ],
);

/** A user's connected account. Tokens are encrypted with TOKEN_ENCRYPTION_KEY. */
export const connections = pgTable(
  "connections",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    provider: text("provider").$type<"google">().notNull(),
    account: text("account").notNull(),
    scopes: text("scopes").notNull(),
    refreshToken: text("refresh_token").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("connections_user_provider_idx").on(t.userId, t.provider)],
);

/** Pending OAuth sign-ins: single use, short-lived, bound to the user who started them. */
export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  userId: owner(),
  provider: text("provider").notNull(),
  verifier: text("verifier").notNull(),
  capability: text("capability").$type<"read" | "write">().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    parentId: text("parent_id"),
    source: text("source").notNull(),
    pageCount: integer("page_count"),
    fields: jsonb("fields").$type<PdfField[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index("files_user_idx").on(t.userId, t.createdAt.desc())],
);

/** The fictional mailbox and calendar used before a real account is connected. */
export const demoWorkspaces = pgTable("demo_workspaces", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<DemoWorkspaceData>().notNull(),
  updatedAt: updatedAt(),
});

/** Receipts for commands run on a user's Linux computer. */
export const computerCommands = pgTable(
  "computer_commands",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    /** Caller-chosen key: repeating an operation returns its receipt instead of running again. */
    operationId: text("operation_id").notNull(),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    command: text("command").notNull(),
    cwd: text("cwd").notNull(),
    status: text("status")
      .$type<"running" | "succeeded" | "failed" | "timed_out" | "interrupted">()
      .notNull(),
    exitCode: integer("exit_code"),
    stdout: text("stdout").notNull().default(""),
    stderr: text("stderr").notNull().default(""),
    truncated: boolean("truncated").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("computer_commands_operation_idx").on(t.userId, t.operationId),
    index("computer_commands_user_idx").on(t.userId, t.startedAt.desc()),
    // One command at a time per computer.
    uniqueIndex("computer_commands_running_idx").on(t.userId).where(sql`status = 'running'`),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("Personal"),
    status: text("status").$type<GoalStatus>().notNull().default("active"),
    milestones: jsonb("milestones").$type<Milestone[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_user_idx").on(t.userId, t.updatedAt.desc())],
);

/** Recurring checks of a public page. A scheduler enqueues one check per due time slot. */
export const monitors = pgTable(
  "monitors",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    condition: text("condition").$type<MonitorCondition>().notNull(),
    value: text("value").notNull().default(""),
    currency: text("currency"),
    intervalMinutes: integer("interval_minutes").notNull(),
    status: text("status").$type<MonitorStatus>().notNull().default("active"),
    /** Null while no check is scheduled (paused or stopped). */
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastHash: text("last_hash"),
    lastExcerpt: text("last_excerpt").notNull().default(""),
    lastPrice: text("last_price"),
    matched: boolean("matched").notNull().default(false),
    failures: integer("failures").notNull().default(0),
    error: text("error"),
    checks: integer("checks").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("monitors_user_idx").on(t.userId, t.createdAt.desc()),
    index("monitors_due_idx").on(t.nextCheckAt).where(sql`status = 'active'`),
  ],
);

export const monitorChecks = pgTable(
  "monitor_checks",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    userId: owner(),
    outcome: text("outcome").$type<MonitorOutcome>().notNull(),
    detail: text("detail").notNull().default(""),
    price: text("price"),
    createdAt: createdAt(),
  },
  (t) => [index("monitor_checks_monitor_idx").on(t.monitorId, t.createdAt.desc())],
);

/** Editable pages served under demo:// so watches can be tried without the internet. */
export const demoPages = pgTable(
  "demo_pages",
  {
    userId: owner(),
    slug: text("slug").notNull(),
    text: text("text").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.slug] })],
);

/** Suggestions. The id is derived from the source, so a dismissed idea never comes back. */
export const ideas = pgTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    kind: text("kind")
      .$type<"paperwork" | "reply" | "event" | "plan" | "watch" | "finance">()
      .notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    prompt: text("prompt").notNull(),
    evidence: jsonb("evidence").$type<Evidence[]>().notNull(),
    status: text("status").$type<IdeaStatus>().notNull().default("new"),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ideas_user_idx").on(t.userId, t.status, t.createdAt.desc())],
);

export const financeReports = pgTable(
  "finance_reports",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    currency: text("currency"),
    convention: text("convention").$type<AmountConvention>().notNull(),
    summary: jsonb("summary")
      .$type<
        Omit<FinanceReport, "id" | "name" | "currency" | "convention" | "goalId" | "createdAt">
      >()
      .notNull(),
    transactions: jsonb("transactions").$type<Transaction[]>().notNull(),
    goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("finance_reports_user_idx").on(t.userId, t.createdAt.desc())],
);

export const schema = {
  user,
  session,
  account,
  verification,
  settings,
  threads,
  messages,
  tasks,
  taskEvents,
  actions,
  memories,
  notifications,
  browserSessions,
  connections,
  oauthStates,
  files,
  demoWorkspaces,
  computerCommands,
  goals,
  monitors,
  monitorChecks,
  demoPages,
  ideas,
  financeReports,
};
