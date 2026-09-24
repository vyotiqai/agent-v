import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import type { AccessControl } from "better-auth/plugins/access";
import { admin } from "better-auth/plugins/admin";
import { defaultAc } from "better-auth/plugins/admin/access";
import { bearer } from "better-auth/plugins/bearer";
import { organization } from "better-auth/plugins/organization";
import { eq, inArray, sql } from "drizzle-orm";
import { eraseAccount, prepareDeletion } from "./account/service.ts";
import type { Context } from "./context.ts";
import { member, schema, user } from "./db/schema.ts";

export const clientIpHeader = "x-agent-v-client-ip";

/**
 * Operators can list accounts, ban them and end their sessions. They cannot impersonate
 * anyone, set passwords or edit accounts: an operator never sees a person's agent or data.
 */
const operatorRole = defaultAc.newRole({
  user: ["list", "get", "ban"],
  session: ["list", "revoke"],
});
const personRole = defaultAc.newRole({ user: [], session: [] });

async function inTeam(ctx: Context, userId: string) {
  const [row] = await ctx.db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return Boolean(row);
}

export function createAuth(ctx: Context) {
  const { config } = ctx;
  const link = (path: string) => `${config.appUrl}${path}`;
  // Emailed links land in the app unless the request named another trusted page.
  const landing = (url: string, path: string) => {
    const parsed = new URL(url);
    const callback = parsed.searchParams.get("callbackURL");
    if (!callback || callback === "/") parsed.searchParams.set("callbackURL", link(path));
    return parsed.toString();
  };
  return betterAuth({
    appName: "Agent V",
    baseURL: config.publicUrl,
    basePath: "/api/auth",
    secret: config.authSecret,
    trustedOrigins: [...config.allowedOrigins, config.appUrl],
    database: drizzleAdapter(ctx.db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
        rateLimit: schema.authRateLimit,
      },
    }),
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      // Set by the API from the socket (or a trusted proxy), never taken from the client.
      ipAddress: { ipAddressHeaders: [clientIpHeader] },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      async sendResetPassword({ user, url }) {
        await ctx.mailer.send({
          to: user.email,
          subject: "Reset your Agent V password",
          text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your password. The link works for one hour. If it wasn't you, ignore this email.`,
          action: { label: "Choose a new password", url: landing(url, "/reset-password") },
        });
      },
    },
    emailVerification: {
      sendOnSignUp: ctx.mailer.delivers,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url }) {
        await ctx.mailer.send({
          to: user.email,
          subject: "Confirm your email for Agent V",
          text: `Hi ${user.name},\n\nConfirm this is your email address so you can join teams and reset your password.`,
          action: { label: "Confirm email", url: landing(url, "/settings?verified=1") },
        });
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: (u) => prepareDeletion(ctx, u.id),
        afterDelete: (u) => eraseAccount(u.id),
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (u) => ({
            data: {
              ...u,
              role: config.adminEmails.includes(u.email.toLowerCase()) ? "admin" : "user",
            },
          }),
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: config.env !== "test",
      window: 60,
      max: 100,
      storage: config.rateLimits.store === "postgres" ? "database" : "memory",
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60 * 15, max: 5 },
        "/send-verification-email": { window: 60 * 15, max: 5 },
      },
    },
    telemetry: { enabled: false },
    plugins: [
      // Mobile and desktop clients authenticate with `Authorization: Bearer <token>`.
      bearer(),
      admin({
        ac: defaultAc as unknown as AccessControl,
        roles: { admin: operatorRole, user: personRole },
        adminRoles: ["admin"],
        defaultRole: "user",
        bannedUserMessage: "This account has been suspended. Contact support if this is a mistake.",
      }),
      organization({
        creatorRole: "owner",
        invitationExpiresIn: 7 * 24 * 60 * 60,
        cancelPendingInvitationsOnReInvite: true,
        // With real email, an invitation only works for someone who proved the address.
        requireEmailVerificationOnInvitation: ctx.mailer.delivers,
        membershipLimit: 500,
        async sendInvitationEmail(data) {
          await ctx.mailer.send({
            to: data.email,
            subject: `${data.inviter.user.name} invited you to ${data.organization.name} on Agent V`,
            text: `${data.inviter.user.name} (${data.inviter.user.email}) invited you to join the team "${data.organization.name}" on Agent V. Teams share a plan; everything you do with your agent stays private to you.\n\nThe invitation expires in 7 days.`,
            action: { label: "Open the invitation", url: link(`/team?invite=${data.id}`) },
          });
        },
        organizationHooks: {
          // One team per person keeps "whose plan applies" unambiguous.
          async beforeCreateOrganization({ user: u }) {
            if (await inTeam(ctx, u.id))
              throw new APIError("BAD_REQUEST", { message: "Leave your current team first" });
          },
          async beforeAcceptInvitation({ user: u }) {
            if (await inTeam(ctx, u.id))
              throw new APIError("BAD_REQUEST", { message: "Leave your current team first" });
          },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Make the configured operator emails admins (for accounts created before they were listed). */
export async function promoteAdmins(ctx: Context) {
  if (!ctx.config.adminEmails.length) return;
  await ctx.db
    .update(user)
    .set({ role: "admin" })
    .where(inArray(sql`lower(${user.email})`, ctx.config.adminEmails));
}
