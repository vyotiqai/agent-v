import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import type { Auth } from "./auth.ts";
import type { Context } from "./context.ts";
import { user } from "./db/schema.ts";

/** The one built-in account in SINGLE_USER mode. It has no password, so nobody can sign in as it. */
export const singleUserEmail = "me@agent-v.local";

type Env = { Variables: { userId: string } };

const thisMachine = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * SINGLE_USER mode: no sign-in. The app asks this route for a session for the built-in account.
 * Only meant for a server on your own computer, so a request must name this machine as its host
 * (which also defeats DNS rebinding) and come from an allowed origin, or from no browser page.
 */
export function singleUserRoutes(app: Hono<Env>, ctx: Context, auth: Auth) {
  let owner: Promise<string> | undefined;
  const ownerId = () => {
    owner ??= findOrCreateOwner().catch((error) => {
      owner = undefined;
      throw error;
    });
    return owner;
  };
  async function findOrCreateOwner() {
    const [row] = await ctx.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, singleUserEmail));
    if (row) return row.id;
    const internal = (await auth.$context).internalAdapter;
    const created = await internal.createUser(
      {
        name: "You",
        email: singleUserEmail,
        emailVerified: true,
      },
      { method: "single-user" },
    );
    return created.id;
  }

  app.post("/api/single-user/session", async (c) => {
    if (!ctx.config.singleUser) return c.json({ error: "Not found" }, 404);
    const host = c.req.header("host");
    const hostname = host ? new URL(`http://${host}`).hostname : "";
    const origin = c.req.header("origin");
    const trusted = [...ctx.config.allowedOrigins, ctx.config.appUrl];
    if (!thisMachine.has(hostname) || (origin && !trusted.includes(origin)))
      return c.json({ error: "Single-user mode only answers this computer's own app" }, 403);
    const internal = (await auth.$context).internalAdapter;
    const session = await internal.createSession(await ownerId());
    return c.json({ token: session.token });
  });
}
