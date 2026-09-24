import { resolve } from "node:path";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const schema = z.object({
  BROWSER_HOST: z.string().default("127.0.0.1"),
  BROWSER_PORT: z.coerce.number().int().min(1).max(65535).default(8790),
  BROWSER_TOKEN: z.string().min(32, "BROWSER_TOKEN must be at least 32 characters"),
  BROWSER_DATA_DIR: z.string().default(".agent-v/browser"),
  /** Chromium binary; defaults to the one bundled for this Playwright version. */
  CHROMIUM_PATH: z.string().optional(),
  BROWSER_MAX_ACTIVE: z.coerce.number().int().min(1).max(64).default(4),
  BROWSER_IDLE_MINUTES: z.coerce
    .number()
    .min(1)
    .max(24 * 60)
    .default(10),
  /** Only for local development and tests: let pages reach private networks. */
  BROWSER_ALLOW_PRIVATE: bool.default(false),
});

export interface WorkerConfig {
  host: string;
  port: number;
  token: string;
  dataDir: string;
  chromiumPath?: string;
  maxActive: number;
  idleMs: number;
  allowPrivate: boolean;
}

export function readWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): WorkerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid browser worker configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  const e = parsed.data;
  return {
    host: e.BROWSER_HOST,
    port: e.BROWSER_PORT,
    token: e.BROWSER_TOKEN,
    dataDir: resolve(e.BROWSER_DATA_DIR),
    chromiumPath: e.CHROMIUM_PATH,
    maxActive: e.BROWSER_MAX_ACTIVE,
    idleMs: e.BROWSER_IDLE_MINUTES * 60_000,
    allowPrivate: e.BROWSER_ALLOW_PRIVATE,
  };
}
