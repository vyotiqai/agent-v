import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import { schema } from "./db/schema.ts";

export const clientIpHeader = "x-agent-v-client-ip";

export function createAuth(config: Config, db: Db) {
  return betterAuth({
    appName: "Agent V",
    baseURL: config.publicUrl,
    basePath: "/api/auth",
    secret: config.authSecret,
    trustedOrigins: config.allowedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      // Set by the API from the socket (or a trusted proxy), never taken from the client.
      ipAddress: { ipAddressHeaders: [clientIpHeader] },
    },
    emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: config.env !== "test", window: 60, max: 100 },
    telemetry: { enabled: false },
    // Mobile clients authenticate with `Authorization: Bearer <token>` instead of cookies.
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
