import { createHash, randomBytes } from "node:crypto";
import type { Connection } from "@agent-v/shared";
import { and, eq, gt, lt } from "drizzle-orm";
import { type Context, newId } from "../../context.ts";
import { connections, oauthStates } from "../../db/schema.ts";
import { AppError } from "../../errors.ts";
import { Vault } from "../../vault.ts";

export const googleScopes = {
  read: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
  ],
  write: [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
  ],
};

type ConnectionRow = typeof connections.$inferSelect;

function google(ctx: Context) {
  if (!ctx.config.google) throw new AppError("Google is not configured on this server", 503);
  return ctx.config.google;
}

function vault(ctx: Context) {
  if (!ctx.config.encryptionKey) throw new AppError("TOKEN_ENCRYPTION_KEY is not set", 503);
  return new Vault(ctx.config.encryptionKey);
}

const tokenContext = (row: { userId: string; provider: string }) =>
  `connection:${row.userId}:${row.provider}`;

export const canWrite = (scopes: string) =>
  googleScopes.write.every((scope) => scopes.split(" ").includes(scope));

export function toConnection(row: ConnectionRow): Connection {
  return {
    provider: "google",
    account: row.account,
    capability: canWrite(row.scopes) ? "write" : "read",
    connectedAt: row.createdAt.toISOString(),
  };
}

export async function getConnection(ctx: Context, userId: string) {
  const [row] = await ctx.db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, "google")));
  return row ?? null;
}

/** Start sign-in: a single-use state bound to this user, with a PKCE verifier. */
export async function startGoogleAuth(ctx: Context, userId: string, capability: "read" | "write") {
  const g = google(ctx);
  vault(ctx);
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  await ctx.db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
  await ctx.db.insert(oauthStates).values({
    state,
    userId,
    provider: "google",
    verifier,
    capability,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  const scopes = [...googleScopes.read, ...(capability === "write" ? googleScopes.write : [])];
  const params = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: g.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return `${g.accountsBase}/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(ctx: Context, body: Record<string, string>) {
  const g = google(ctx);
  let response: Response;
  try {
    response = await fetch(`${g.oauthBase}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, ...body }),
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError("Google could not be reached", 502);
  }
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  return { ok: response.ok, data };
}

/** Finish sign-in from Google's redirect. Returns the connected user id. */
export async function completeGoogleAuth(ctx: Context, state: string, code: string) {
  const g = google(ctx);
  const [pending] = await ctx.db
    .delete(oauthStates)
    .where(and(eq(oauthStates.state, state), gt(oauthStates.expiresAt, new Date())))
    .returning();
  if (!pending) throw new AppError("This sign-in link expired. Start again from the app.", 400);
  const { ok, data } = await tokenRequest(ctx, {
    grant_type: "authorization_code",
    code,
    redirect_uri: g.redirectUri,
    code_verifier: pending.verifier,
  });
  if (!ok || !data.access_token) throw new AppError("Google did not accept the sign-in", 400);
  const scopes = data.scope ?? "";
  if (!googleScopes.read.slice(2).every((s) => scopes.split(" ").includes(s)))
    throw new AppError("Grant access to Gmail and Calendar to connect", 400);
  const profile: { email?: string } = await fetch(`${g.apiBase}/oauth2/v3/userinfo`, {
    headers: { authorization: `Bearer ${data.access_token}` },
    signal: AbortSignal.timeout(20_000),
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ email?: string }>) : {}))
    .catch(() => ({}));
  if (!profile.email) throw new AppError("Google did not share the account's email", 400);

  const existing = await getConnection(ctx, pending.userId);
  const refresh =
    data.refresh_token ??
    (existing && existing.account === profile.email
      ? vault(ctx).open(existing.refreshToken, tokenContext(existing))
      : null);
  if (!refresh)
    throw new AppError(
      "Google did not return offline access. Remove the app's access in your Google account and try again.",
      400,
    );
  const sealed = vault(ctx).seal(
    refresh,
    tokenContext({ userId: pending.userId, provider: "google" }),
  );
  await ctx.db
    .insert(connections)
    .values({
      id: newId(),
      userId: pending.userId,
      provider: "google",
      account: profile.email,
      scopes,
      refreshToken: sealed,
    })
    .onConflictDoUpdate({
      target: [connections.userId, connections.provider],
      set: { account: profile.email, scopes, refreshToken: sealed, updatedAt: new Date() },
    });
  accessTokens.delete(pending.userId);
  await ctx.realtime.publish(pending.userId, { type: "connection", id: "google" });
  return pending.userId;
}

const accessTokens = new Map<string, { token: string; expires: number; account: string }>();

/** A fresh access token, refreshed with the stored refresh token when needed. */
export async function accessToken(ctx: Context, row: ConnectionRow, force = false) {
  const cached = accessTokens.get(row.userId);
  if (!force && cached && cached.account === row.account && cached.expires > Date.now() + 60_000)
    return cached.token;
  const refresh = vault(ctx).open(row.refreshToken, tokenContext(row));
  const { ok, data } = await tokenRequest(ctx, {
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  if (!ok || !data.access_token) {
    if (data.error === "invalid_grant") {
      await ctx.db.delete(connections).where(eq(connections.id, row.id));
      await ctx.realtime.publish(row.userId, { type: "connection", id: "google" });
      throw new AppError("Google access was revoked. Reconnect Google in Settings.", 409);
    }
    throw new AppError("Google sign-in could not be refreshed", 502);
  }
  accessTokens.set(row.userId, {
    token: data.access_token,
    expires: Date.now() + (data.expires_in ?? 3600) * 1000,
    account: row.account,
  });
  return data.access_token;
}

export async function disconnectGoogle(ctx: Context, userId: string) {
  const row = await getConnection(ctx, userId);
  if (!row) return;
  const g = ctx.config.google;
  if (g) {
    const token = (() => {
      try {
        return vault(ctx).open(row.refreshToken, tokenContext(row));
      } catch {
        return null;
      }
    })();
    if (token)
      await fetch(`${g.oauthBase}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {});
  }
  await ctx.db.delete(connections).where(eq(connections.id, row.id));
  accessTokens.delete(userId);
  await ctx.realtime.publish(userId, { type: "connection", id: "google" });
}
