import { createECDH, createHash, hkdfSync } from "node:crypto";
import { resolve } from "node:path";
import type { Limits } from "@agent-v/shared";
import { z } from "zod";

const compatProvider = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  baseURL: z.url(),
  apiKey: z.string().optional(),
  models: z.array(z.string().min(1)).default([]),
});

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  PUBLIC_URL: z.url().default("http://localhost:8787"),
  // The Expo web dev server, plus the desktop app (tauri://localhost on macOS/Linux,
  // http://tauri.localhost on Windows).
  ALLOWED_ORIGINS: z
    .string()
    .default(
      "http://localhost:8081,http://127.0.0.1:8081,tauri://localhost,http://tauri.localhost",
    ),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  DEFAULT_MODEL: z.string().default("demo/agent-v"),
  /** Comma-separated "provider/model" ids users may pick. The default model is always allowed. */
  ALLOWED_MODELS: z.string().default(""),
  DEMO_MODEL: bool.optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  /** JSON array of OpenAI-compatible endpoints: [{"name":"ollama","baseURL":"http://…/v1"}] */
  OPENAI_COMPATIBLE_PROVIDERS: z.string().default("[]"),
  /** Browser worker (apps/browser). Browser tools are off when unset. */
  BROWSER_URL: z.url().optional(),
  BROWSER_TOKEN: z.string().min(32, "BROWSER_TOKEN must be at least 32 characters").optional(),
  /** Private files (PDFs, attachments). */
  DATA_DIR: z.string().default(".agent-v/data"),
  /** Encrypts connected-account tokens at rest: 32 random bytes, base64. */
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Overridable only so tests can point at a fake Google. */
  GOOGLE_ACCOUNTS_BASE: z.url().default("https://accounts.google.com"),
  GOOGLE_OAUTH_BASE: z.url().default("https://oauth2.googleapis.com"),
  GOOGLE_API_BASE: z.url().default("https://www.googleapis.com"),
  /** A fictional mailbox and calendar for people without a Google connection. */
  DEMO_WORKSPACE: bool.optional(),
  /** Per-user Linux computer: "docker" (needs Docker; optionally gVisor) or "none". */
  COMPUTER_PROVIDER: z.enum(["none", "docker"]).default("none"),
  COMPUTER_IMAGE: z.string().default("agent-v-computer:local"),
  /** Optional OCI runtime for stronger isolation, e.g. "runsc" for gVisor. */
  COMPUTER_RUNTIME: z
    .string()
    .regex(/^[\w.-]+$/)
    .optional(),
  COMPUTER_MEMORY_MB: z.coerce.number().int().min(128).max(65536).default(1024),
  COMPUTER_CPUS: z.coerce.number().min(0.1).max(64).default(1),
  COMPUTER_PIDS: z.coerce.number().int().min(32).max(32768).default(256),
  COMPUTER_COMMAND_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(3600).default(120),
  /** Names this deployment's containers; defaults to a hash of PUBLIC_URL. */
  DEPLOYMENT_ID: z
    .string()
    .regex(/^[a-z0-9-]{1,32}$/)
    .optional(),
  /** Trust X-Forwarded-For from a reverse proxy in front of the API. */
  TRUST_PROXY: bool.default(false),
  TASK_WORKERS: z.coerce.number().int().min(1).max(64).default(4),
  /** Page checks run at once per server process. */
  MONITOR_WORKERS: z.coerce.number().int().min(1).max(64).default(4),
  /** Run the every-minute watch scheduler in this process (turn off for API-only replicas). */
  MONITOR_SCHEDULE: bool.optional(),
  /** Allow web_fetch to reach private networks. Only for local development against local pages. */
  ALLOW_PRIVATE_NETWORK_FETCH: bool.default(false),
  /** A built-in MCP server with sample tools, so connectors can be tried without setup. */
  MCP_DEMO: bool.optional(),
  /** Expo push service (iOS/Android). The token is optional unless push security is enabled. */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  EXPO_PUSH_URL: z.url().default("https://exp.host/--/api/v2/push"),
  /** Web Push VAPID keys (npx web-push generate-vapid-keys). Derived in development. */
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_SUBJECT: z.string().default("mailto:admin@localhost"),
  /** "provider/model" for memory embeddings; "demo/hash" works offline. */
  EMBEDDING_MODEL: z.string().default("demo/hash"),
  /** "openai/model" for voice transcription (uses OPENAI_API_KEY and OPENAI_BASE_URL). */
  TRANSCRIPTION_MODEL: z.string().optional(),
  /** Where people use the app (links in emails, checkout returns). Defaults to the first origin. */
  APP_URL: z.url().optional(),
  /** Unset: no quotas (self-hosted). "default": Free, Pro and Team. Or a JSON array of plans. */
  PLANS: z.string().optional(),
  /** JSON map of plan id to Stripe price id: {"pro":"price_…","team":"price_…"}. */
  STRIPE_PRICES: z.string().default("{}"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Overridable only so tests can point at a fake Stripe. */
  STRIPE_API_BASE: z.url().default("https://api.stripe.com"),
  /** Comma-separated emails that become platform admins when they sign up or sign in. */
  ADMIN_EMAILS: z.string().default(""),
  /** smtp(s)://user:pass@host:port for account emails. Without it, emails are logged (not in production). */
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("Agent V <no-reply@localhost>"),
  /** Per-user request limits. On by default outside tests. */
  RATE_LIMITS: bool.optional(),
  /** "memory" for one API process, "postgres" when several replicas share the limits. */
  RATE_LIMIT_STORE: z.enum(["memory", "postgres"]).default("memory"),
  /** OpenTelemetry: traces and metrics are exported over OTLP/HTTP when this is set. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_SERVICE_NAME: z.string().default("agent-v-server"),
  /** Put prompts and replies on AI spans. Off by default: traces hold no personal content. */
  OTEL_RECORD_CONTENT: bool.default(false),
  /** "json" writes one JSON object per log line (with trace ids) for log collectors. */
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
  /** Serve the exported web app (apps/app dist) from the API origin. */
  WEB_DIR: z.string().optional(),
});

const limit = z.number().int().min(0).nullable();
const planSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  name: z.string().min(1).max(40),
  price: z.string().max(40).nullable().default(null),
  team: z.boolean().default(false),
  limits: z.object({
    tokens: limit,
    tasks: limit,
    browserActions: limit,
    computerMinutes: limit,
    voiceMinutes: limit,
    storageMb: limit,
    connectors: limit,
    watches: limit,
  }),
});
export type PlanConfig = z.infer<typeof planSchema> & { stripePrice?: string };

const unlimited: Limits = {
  tokens: null,
  tasks: null,
  browserActions: null,
  computerMinutes: null,
  voiceMinutes: null,
  storageMb: null,
  connectors: null,
  watches: null,
};
const pro: Limits = {
  tokens: 5_000_000,
  tasks: 500,
  browserActions: 5000,
  computerMinutes: 600,
  voiceMinutes: 300,
  storageMb: 5000,
  connectors: 20,
  watches: 50,
};
/** The built-in plans for PLANS=default. The first plan is where everyone starts. */
export const defaultPlans: z.input<typeof planSchema>[] = [
  {
    id: "free",
    name: "Free",
    price: null,
    limits: {
      tokens: 300_000,
      tasks: 30,
      browserActions: 300,
      computerMinutes: 30,
      voiceMinutes: 30,
      storageMb: 200,
      connectors: 2,
      watches: 3,
    },
  },
  { id: "pro", name: "Pro", price: "$12 / month", limits: pro },
  { id: "team", name: "Team", price: "$20 / member / month", team: true, limits: pro },
];

export interface Config {
  env: "development" | "production" | "test";
  host: string;
  port: number;
  publicUrl: string;
  allowedOrigins: string[];
  databaseUrl: string;
  authSecret: string;
  defaultModel: string;
  allowedModels: string[];
  demoModel: boolean;
  providers: {
    openai?: { apiKey: string; baseURL?: string };
    anthropic?: { apiKey: string };
    google?: { apiKey: string };
    compat: z.infer<typeof compatProvider>[];
  };
  taskWorkers: number;
  monitorWorkers: number;
  monitorSchedule: boolean;
  browser?: { url: string; token: string };
  dataDir: string;
  encryptionKey?: Buffer;
  google?: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    accountsBase: string;
    oauthBase: string;
    apiBase: string;
  };
  demoWorkspace: boolean;
  computer?: {
    image: string;
    runtime?: string;
    memoryMb: number;
    cpus: number;
    pids: number;
    commandTimeoutSeconds: number;
    deploymentId: string;
  };
  trustProxy: boolean;
  allowPrivateNetworkFetch: boolean;
  mcpDemo: boolean;
  push: {
    expo: { url: string; accessToken?: string };
    webPush?: { publicKey: string; privateKey: string; subject: string };
  };
  embeddingModel: string;
  transcriptionModel?: string;
  appUrl: string;
  plans: { enforced: boolean; list: PlanConfig[] };
  stripe?: { secretKey: string; webhookSecret: string; apiBase: string };
  adminEmails: string[];
  email: { smtpUrl?: string; from: string };
  rateLimits: { enabled: boolean; store: "memory" | "postgres" };
  telemetry: {
    endpoint?: string;
    serviceName: string;
    recordContent: boolean;
    logFormat: "pretty" | "json";
  };
  webDir?: string;
}

function readPlans(value: string | undefined, prices: Record<string, string>) {
  if (!value)
    return {
      enforced: false,
      list: [{ id: "unlimited", name: "Unlimited", price: null, team: false, limits: unlimited }],
    };
  const list = z
    .array(planSchema)
    .min(1)
    .parse(value === "default" ? defaultPlans : JSON.parse(value))
    .map((plan) => ({ ...plan, stripePrice: prices[plan.id] }));
  if (new Set(list.map((p) => p.id)).size !== list.length)
    throw new Error("PLANS has duplicate plan ids");
  return { enforced: true, list };
}

/** Development convenience: a stable secret derived from the auth secret, never in production. */
const derive = (secret: string, purpose: string) =>
  Buffer.from(hkdfSync("sha256", secret, "agent-v", purpose, 32));

function vapidKeys(secret: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(derive(secret, "web-push vapid"));
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: ecdh.getPrivateKey().toString("base64url"),
  };
}

export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  const e = parsed.data;
  const compat = z.array(compatProvider).parse(JSON.parse(e.OPENAI_COMPATIBLE_PROVIDERS));
  const reserved = new Set(["openai", "anthropic", "google", "demo"]);
  for (const provider of compat)
    if (reserved.has(provider.name))
      throw new Error(`OpenAI-compatible provider name "${provider.name}" is reserved`);
  const production = e.NODE_ENV === "production";
  const encryptionKey = e.TOKEN_ENCRYPTION_KEY
    ? Buffer.from(e.TOKEN_ENCRYPTION_KEY, "base64")
    : production
      ? undefined
      : derive(e.BETTER_AUTH_SECRET, "token encryption");
  const webPush =
    e.WEB_PUSH_PUBLIC_KEY && e.WEB_PUSH_PRIVATE_KEY
      ? { publicKey: e.WEB_PUSH_PUBLIC_KEY, privateKey: e.WEB_PUSH_PRIVATE_KEY }
      : production
        ? undefined
        : vapidKeys(e.BETTER_AUTH_SECRET);
  if (encryptionKey && encryptionKey.length !== 32)
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  if (e.GOOGLE_CLIENT_ID && !encryptionKey)
    throw new Error("Set TOKEN_ENCRYPTION_KEY (openssl rand -base64 32) before connecting Google");
  if (production && !e.SMTP_URL)
    console.warn("[config] SMTP_URL is not set: password resets and invitations cannot be emailed");
  if (Boolean(e.STRIPE_SECRET_KEY) !== Boolean(e.STRIPE_WEBHOOK_SECRET))
    throw new Error("Set both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, or neither");
  const origins = e.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = e.ALLOWED_MODELS.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    publicUrl: e.PUBLIC_URL.replace(/\/$/, ""),
    allowedOrigins: origins,
    databaseUrl: e.DATABASE_URL,
    authSecret: e.BETTER_AUTH_SECRET,
    defaultModel: e.DEFAULT_MODEL,
    allowedModels: [...new Set([e.DEFAULT_MODEL, ...allowed])],
    demoModel: e.DEMO_MODEL ?? e.NODE_ENV !== "production",
    providers: {
      openai: e.OPENAI_API_KEY
        ? { apiKey: e.OPENAI_API_KEY, baseURL: e.OPENAI_BASE_URL }
        : undefined,
      anthropic: e.ANTHROPIC_API_KEY ? { apiKey: e.ANTHROPIC_API_KEY } : undefined,
      google: e.GOOGLE_GENERATIVE_AI_API_KEY
        ? { apiKey: e.GOOGLE_GENERATIVE_AI_API_KEY }
        : undefined,
      compat,
    },
    taskWorkers: e.TASK_WORKERS,
    monitorWorkers: e.MONITOR_WORKERS,
    monitorSchedule: e.MONITOR_SCHEDULE ?? true,
    browser:
      e.BROWSER_URL && e.BROWSER_TOKEN
        ? { url: e.BROWSER_URL.replace(/\/$/, ""), token: e.BROWSER_TOKEN }
        : undefined,
    dataDir: resolve(e.DATA_DIR),
    encryptionKey,
    google:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? {
            clientId: e.GOOGLE_CLIENT_ID,
            clientSecret: e.GOOGLE_CLIENT_SECRET,
            redirectUri: `${e.PUBLIC_URL.replace(/\/$/, "")}/api/google/callback`,
            accountsBase: e.GOOGLE_ACCOUNTS_BASE.replace(/\/$/, ""),
            oauthBase: e.GOOGLE_OAUTH_BASE.replace(/\/$/, ""),
            apiBase: e.GOOGLE_API_BASE.replace(/\/$/, ""),
          }
        : undefined,
    demoWorkspace: e.DEMO_WORKSPACE ?? e.NODE_ENV !== "production",
    computer:
      e.COMPUTER_PROVIDER === "docker"
        ? {
            image: e.COMPUTER_IMAGE,
            runtime: e.COMPUTER_RUNTIME,
            memoryMb: e.COMPUTER_MEMORY_MB,
            cpus: e.COMPUTER_CPUS,
            pids: e.COMPUTER_PIDS,
            commandTimeoutSeconds: e.COMPUTER_COMMAND_TIMEOUT_SECONDS,
            deploymentId:
              e.DEPLOYMENT_ID ??
              createHash("sha256").update(e.PUBLIC_URL).digest("hex").slice(0, 12),
          }
        : undefined,
    trustProxy: e.TRUST_PROXY,
    allowPrivateNetworkFetch: e.ALLOW_PRIVATE_NETWORK_FETCH,
    mcpDemo: e.MCP_DEMO ?? !production,
    push: {
      expo: { url: e.EXPO_PUSH_URL.replace(/\/$/, ""), accessToken: e.EXPO_ACCESS_TOKEN },
      webPush: webPush && { ...webPush, subject: e.WEB_PUSH_SUBJECT },
    },
    embeddingModel: e.EMBEDDING_MODEL,
    transcriptionModel: e.TRANSCRIPTION_MODEL,
    appUrl: (e.APP_URL ?? origins[0] ?? e.PUBLIC_URL).replace(/\/$/, ""),
    plans: readPlans(
      e.PLANS,
      z.record(z.string(), z.string().startsWith("price_")).parse(JSON.parse(e.STRIPE_PRICES)),
    ),
    stripe:
      e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET
        ? {
            secretKey: e.STRIPE_SECRET_KEY,
            webhookSecret: e.STRIPE_WEBHOOK_SECRET,
            apiBase: e.STRIPE_API_BASE.replace(/\/$/, ""),
          }
        : undefined,
    adminEmails: e.ADMIN_EMAILS.split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean),
    email: { smtpUrl: e.SMTP_URL, from: e.EMAIL_FROM },
    rateLimits: { enabled: e.RATE_LIMITS ?? e.NODE_ENV !== "test", store: e.RATE_LIMIT_STORE },
    telemetry: {
      endpoint: e.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/, ""),
      serviceName: e.OTEL_SERVICE_NAME,
      recordContent: e.OTEL_RECORD_CONTENT,
      logFormat: e.LOG_FORMAT,
    },
    webDir: e.WEB_DIR ? resolve(e.WEB_DIR) : undefined,
  };
}
