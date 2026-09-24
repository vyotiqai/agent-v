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
    trustProxy: e.TRUST_PROXY,
    allowPrivateNetworkFetch: e.ALLOW_PRIVATE_NETWORK_FETCH,
  };
}
