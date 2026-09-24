import type { ModelOption, Settings } from "@agent-v/shared";
import { useResource } from "./resource";

export interface Me {
  user: { id: string; name: string; email: string };
  settings: Settings;
  models: ModelOption[];
  features: {
    browser: boolean;
    computer: boolean;
    sampleConnector: boolean;
    transcription: boolean;
  };
}

/** The signed-in person, their settings and what this server offers. */
export const useMe = () => useResource<Me>("/api/me", ["settings"]);
