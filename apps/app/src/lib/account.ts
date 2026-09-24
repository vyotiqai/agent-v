import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { api } from "./api";
import { isDesktop } from "./desktop";

/**
 * Open a page outside the app: Stripe checkout, the billing portal, a download. On the web
 * checkout replaces the page (Stripe returns to the app); the desktop app hands links to the
 * system browser.
 */
export async function openOutside(url: string, options: { sameTab?: boolean } = {}) {
  if (Platform.OS !== "web") {
    await WebBrowser.openBrowserAsync(url);
    return;
  }
  if (options.sameTab && !isDesktop) globalThis.location.assign(url);
  else globalThis.open(url, "_blank", "noopener");
}

/** Download everything as a ZIP through a short-lived signed link (works on every platform). */
export async function downloadExport() {
  const { url } = await api<{ url: string }>("/api/account/export-link", { body: {} });
  if (Platform.OS === "web" && !isDesktop) globalThis.location.assign(url);
  else await openOutside(url);
}

const compactFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const compact = (n: number) => compactFormat.format(n);

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
