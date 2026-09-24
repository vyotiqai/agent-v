import { z } from "zod";

// Plans and usage. A limit of null means unlimited.
export type Metric =
  | "tokens"
  | "tasks"
  | "browserActions"
  | "computerMinutes"
  | "voiceMinutes"
  | "storageMb"
  | "connectors"
  | "watches";
export type Limits = Record<Metric, number | null>;

export const metrics: { id: Metric; label: string; unit: string; monthly: boolean }[] = [
  { id: "tokens", label: "AI usage", unit: "tokens", monthly: true },
  { id: "tasks", label: "Background tasks", unit: "tasks", monthly: true },
  { id: "browserActions", label: "Browser actions", unit: "actions", monthly: true },
  { id: "computerMinutes", label: "Computer time", unit: "min", monthly: true },
  { id: "voiceMinutes", label: "Voice input", unit: "min", monthly: true },
  { id: "storageMb", label: "File storage", unit: "MB", monthly: false },
  { id: "connectors", label: "Connectors", unit: "", monthly: false },
  { id: "watches", label: "Watches", unit: "", monthly: false },
];

export interface PlanInfo {
  id: string;
  name: string;
  /** Shown on the plan picker, e.g. "$12 / month". */
  price: string | null;
  limits: Limits;
  /** Can be bought through checkout (a price is configured). */
  purchasable: boolean;
  /** Bought for a whole team, per member. */
  team: boolean;
}

export interface Usage {
  plan: PlanInfo;
  /** Where the plan comes from. */
  source: "default" | "personal" | "team" | "granted";
  /** Quotas are enforced (off on self-hosted servers without plans). */
  enforced: boolean;
  period: { start: string; end: string };
  used: Record<Metric, number>;
  /** Tokens per model this period. */
  models: { model: string; input: number; output: number }[];
  billing: {
    available: boolean;
    /** The personal subscription, when there is one. */
    subscription: SubscriptionInfo | null;
    plans: PlanInfo[];
  };
}

export interface SubscriptionInfo {
  plan: string;
  status: string;
  seats: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  managed: boolean;
}

export const checkoutSchema = z.object({
  plan: z.string().min(1).max(40),
  scope: z.enum(["personal", "team"]).default("personal"),
});

// Teams (organisations): a shared plan and admin; each member's data stays private.
export type TeamRole = "owner" | "admin" | "member";
export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
  /** AI tokens this month; visible to owners and admins. */
  tokens: number | null;
}
export interface TeamInvitation {
  id: string;
  email: string;
  role: TeamRole;
  status: string;
  expiresAt: string;
  /** A link the invitee opens to accept. */
  link: string;
}
export interface TeamInfo {
  team: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    subscription: SubscriptionInfo | null;
  } | null;
  role: TeamRole | null;
  members: TeamMember[];
  invitations: TeamInvitation[];
  /** Invitations addressed to me. */
  received: { id: string; teamName: string; inviter: string; role: TeamRole; expiresAt: string }[];
}

export const teamCreateSchema = z.object({ name: z.string().trim().min(2).max(60) });
export const teamInviteSchema = z.object({
  email: z.email().max(254),
  role: z.enum(["admin", "member"]).default("member"),
});
export const teamRoleSchema = z.object({ role: z.enum(["owner", "admin", "member"]) });

// Platform administration (operators): accounts and plans, never anyone's content.
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  plan: string;
  planSource: Usage["source"];
  tokens: number;
  tasks: number;
}
export interface AdminOverview {
  users: AdminUser[];
  total: number;
  totals: { users: number; activeThisMonth: number; tokens: number; tasks: number };
}
export const adminUpdateSchema = z.object({
  /** Grant a plan without payment; null removes the grant. */
  plan: z.string().max(40).nullable().optional(),
  banned: z.boolean().optional(),
  banReason: z.string().max(200).optional(),
});

export const deleteAccountSchema = z.object({ password: z.string().min(1).max(200) });
