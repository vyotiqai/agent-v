import type { ModelOption, Settings } from "@agent-v/shared";
import { useResource } from "./resource";

export interface Me {
  user: { id: string; name: string; email: string; emailVerified: boolean; role?: string | null };
  settings: Settings;
  models: ModelOption[];
  features: {
    /** Plans with quotas are enforced on this server. */
    plans: boolean;
    /** Paid plans can be bought (Stripe is set up). */
    billing: boolean;
    /** Account emails are really delivered. */
    email: boolean;
    admin: boolean;
    browser: boolean;
    computer: boolean;
    sampleConnector: boolean;
    transcription: boolean;
    /** No sign-in: this server has one built-in account. */
    singleUser: boolean;
  };
}

/** The signed-in person, their settings and what this server offers. */
export const useMe = () => useResource<Me>("/api/me", ["settings", "usage"]);
