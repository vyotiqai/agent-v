import type { Connector } from "@agent-v/shared";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

export const statusText: Record<Connector["status"], string> = {
  connecting: "Connecting…",
  connected: "Connected",
  needs_auth: "Needs sign-in",
  error: "Not reachable",
};
export const statusDot: Record<Connector["status"], string> = {
  connecting: "bg-zinc-400",
  connected: "bg-emerald-500",
  needs_auth: "bg-amber-500",
  error: "bg-red-500",
};

/** Open the server's sign-in page. The result arrives over the live stream. */
export async function openSignIn(url: string) {
  if (Platform.OS === "web") window.open(url, "_blank", "noopener,width=520,height=720");
  else await WebBrowser.openBrowserAsync(url);
}
