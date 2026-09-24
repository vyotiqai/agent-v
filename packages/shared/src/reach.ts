import { z } from "zod";

// MCP connectors: any MCP server the owner adds; its tools become the agent's tools.
export type ConnectorAuth = "none" | "bearer" | "oauth";
export type ConnectorStatus = "connecting" | "connected" | "needs_auth" | "error";
export type ToolPolicy = "auto" | "ask" | "off";
export interface ConnectorTool {
  name: string;
  title: string | null;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The server says the tool only reads (MCP readOnlyHint). */
  readOnly: boolean;
  /** The server says the tool may delete or overwrite (MCP destructiveHint). */
  destructive: boolean;
}
export interface Connector {
  id: string;
  name: string;
  url: string;
  auth: ConnectorAuth;
  status: ConnectorStatus;
  error: string | null;
  serverName: string | null;
  tools: (ConnectorTool & { policy: ToolPolicy })[];
  toolsRefreshedAt: string | null;
  createdAt: string;
}

const name = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\p{L}\p{N} ._-]+$/u, "Use letters, numbers, spaces, dots, dashes or underscores");
export const connectorInputSchema = z.object({
  name,
  url: z.string().trim().min(1).max(2048),
  auth: z.enum(["none", "bearer", "oauth"]).default("none"),
  /** For bearer auth: the token (sent as "Authorization: Bearer …"). */
  token: z.string().min(1).max(8192).optional(),
});
export const connectorUpdateSchema = z.object({
  name: name.optional(),
  policies: z.record(z.string().max(128), z.enum(["auto", "ask", "off"])).optional(),
  token: z.string().min(1).max(8192).optional(),
});

// Push notifications and notification preferences.
export type NotificationCategory = "needs_you" | "results" | "watches" | "ideas";
export const notificationCategories: { id: NotificationCategory; label: string }[] = [
  { id: "needs_you", label: "Questions and approvals" },
  { id: "results", label: "Finished and failed tasks" },
  { id: "watches", label: "Watch alerts" },
  { id: "ideas", label: "New ideas" },
];
export type NotificationPreferences = Record<NotificationCategory, boolean>;
export const defaultNotificationPreferences: NotificationPreferences = {
  needs_you: true,
  results: true,
  watches: true,
  ideas: false,
};
export const pushDeviceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("expo"),
    token: z.string().regex(/^(Exponent|Expo)PushToken\[[\w-]+\]$/, "Not an Expo push token"),
    label: z.string().max(120).default("Phone"),
  }),
  z.object({
    kind: z.literal("webpush"),
    endpoint: z.url().max(2048),
    keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(16).max(64) }),
    label: z.string().max(120).default("Browser"),
  }),
]);
export interface PushDevice {
  id: string;
  kind: "expo" | "webpush";
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}
export const notificationPreferencesSchema = z.object({
  needs_you: z.boolean().optional(),
  results: z.boolean().optional(),
  watches: z.boolean().optional(),
  ideas: z.boolean().optional(),
});
