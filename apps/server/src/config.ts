import { createHash } from "node:crypto";
import { resolve } from "node:path";
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
  ALLOWED_ORIGINS: z.string().default("http://localhost:8081,http://127.0.0.1:8081"),
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
  /** Allow web_fetch to reach private networks. Only for local development against local pages. */
  ALLOW_PRIVATE_NETWORK_FETCH: bool.default(false),
});

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
  const encryptionKey = e.TOKEN_ENCRYPTION_KEY
    ? Buffer.from(e.TOKEN_ENCRYPTION_KEY, "base64")
    : undefined;
  if (encryptionKey && encryptionKey.length !== 32)
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  if (e.GOOGLE_CLIENT_ID && !encryptionKey)
    throw new Error("Set TOKEN_ENCRYPTION_KEY (openssl rand -base64 32) before connecting Google");
  const allowed = e.ALLOWED_MODELS.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    publicUrl: e.PUBLIC_URL.replace(/\/$/, ""),
    allowedOrigins: e.ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
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
  };
}
