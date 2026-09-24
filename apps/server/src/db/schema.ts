import type {
  ActionStatus,
  AmountConvention,
  ConnectorAuth,
  ConnectorStatus,
  ConnectorTool,
  Evidence,
  FinanceReport,
  GoalStatus,
  IdeaStatus,
  Milestone,
  MonitorCondition,
  MonitorOutcome,
  MonitorStatus,
  NotificationCategory,
  NotificationPreferences,
  PdfField,
  PlanStep,
  TaskEventKind,
  TaskStatus,
  ToolCall,
  ToolPolicy,
  Transaction,
} from "@agent-v/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
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
  // Admin plugin: platform role and bans.
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
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
    impersonatedBy: text("impersonated_by"),
    activeOrganizationId: text("active_organization_id"),
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

// Organization plugin: teams share a plan and admin, never each other's data.
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: createdAt(),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("member_org_user_idx").on(t.organizationId, t.userId),
    index("member_user_idx").on(t.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("invitation_org_idx").on(t.organizationId),
    index("invitation_email_idx").on(t.email),
  ],
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
  /** Learn durable facts from conversations (shown in Memory, deletable). */
  learnMemories: boolean("learn_memories").notNull().default(true),
  /** Which notification categories are pushed to devices (missing keys use the defaults). */
  pushPreferences: jsonb("push_preferences")
    .$type<Partial<NotificationPreferences>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  updatedAt: updatedAt(),
});

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    title: text("title").notNull(),
    archived: boolean("archived").notNull().default(false),
    /** A reply is streaming until this time (a lease shared by every API replica). */
    runningUntil: timestamp("running_until", { withTimezone: true }),
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

/** pgvector column without fixed dimensions: rows from different embedding models coexist. */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => JSON.parse(value) as number[],
});

export const memories = pgTable(
  "memories",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    text: text("text").notNull(),
    source: text("source").notNull(),
    origin: text("origin").$type<"manual" | "chat" | "task">().notNull().default("manual"),
    embedding: vector("embedding"),
    embeddingModel: text("embedding_model"),
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
    category: text("category").$type<NotificationCategory>().notNull().default("results"),
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

/** A user's MCP server. Credentials (bearer token or OAuth state) are sealed with the vault. */
export const connectors = pgTable(
  "connectors",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    auth: text("auth").$type<ConnectorAuth>().notNull(),
    /** Sealed JSON: { bearer } or { client, tokens }. */
    secret: text("secret"),
    status: text("status").$type<ConnectorStatus>().notNull().default("connecting"),
    error: text("error"),
    transport: text("transport").$type<"http" | "sse">(),
    serverInfo: jsonb("server_info").$type<{
      name: string;
      version: string;
      instructions?: string;
    }>(),
    tools: jsonb("tools").$type<ConnectorTool[]>().notNull().default(sql`'[]'::jsonb`),
    /** Per tool: run automatically, ask first, or never offer it to the agent. */
    policies: jsonb("policies")
      .$type<Record<string, ToolPolicy>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    toolsRefreshedAt: timestamp("tools_refreshed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("connectors_user_name_idx").on(t.userId, t.name)],
);

/** Phones (Expo push tokens) and browsers (Web Push subscriptions) that receive pushes. */
export const pushDevices = pgTable(
  "push_devices",
  {
    id: text("id").primaryKey(),
    userId: owner(),
    kind: text("kind").$type<"expo" | "webpush">().notNull(),
    /** The Expo token or the Web Push endpoint; one device belongs to one account. */
    address: text("address").notNull(),
    keys: jsonb("keys").$type<{ p256dh: string; auth: string }>(),
    label: text("label").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("push_devices_address_idx").on(t.address),
    index("push_devices_user_idx").on(t.userId),
  ],
);

/** Metered usage per user and calendar month (UTC), one counter per metric. */
export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: owner(),
    /** "YYYY-MM" */
    period: text("period").notNull(),
    /** "tokens", "tasks", … or "input_tokens:<model>" / "output_tokens:<model>". */
    metric: text("metric").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.period, t.metric] })],
);

export type SubjectType = "user" | "organization";

/** Paid plans (Stripe) and plans granted by an operator, for a person or a team. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type").$type<SubjectType>().notNull(),
    subjectId: text("subject_id").notNull(),
    provider: text("provider").$type<"stripe" | "grant">().notNull(),
    plan: text("plan").notNull(),
    /** Stripe's status, or "active" for a grant. */
    status: text("status").notNull(),
    customerId: text("customer_id"),
    externalId: text("external_id").unique(),
    itemId: text("item_id"),
    seats: integer("seats"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("subscriptions_subject_provider_idx").on(t.subjectType, t.subjectId, t.provider),
  ],
);

/** The Stripe customer for a person or a team. */
export const billingCustomers = pgTable(
  "billing_customers",
  {
    subjectType: text("subject_type").$type<SubjectType>().notNull(),
    subjectId: text("subject_id").notNull(),
    customerId: text("customer_id").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.subjectType, t.subjectId] })],
);

/** Better Auth's sign-in rate limits, when replicas share them (RATE_LIMIT_STORE=postgres). */
export const authRateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Fixed-window request counters shared by every API replica. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const schema = {
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
  usageCounters,
  subscriptions,
  billingCustomers,
  rateLimits,
  authRateLimit,
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
  connectors,
  pushDevices,
};
