import { router } from "expo-router";
import { useEffect } from "react";
import { api } from "./api";

export const pushSupported = () =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

const toBytes = (base64url: string) => {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

function browserName() {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${name} on ${/Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : "Linux"}`;
}

/** Ask for permission, subscribe this browser with the server's key, and register it. */
export async function enablePush(webPushKey: string | null) {
  if (!pushSupported()) throw new Error("This browser cannot receive push notifications");
  if (!webPushKey) throw new Error("Web Push is not configured on the server");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked for this site");
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const key = toBytes(webPushKey);
  // A subscription made with another server key cannot be reused.
  const current = existing?.options.applicationServerKey;
  if (existing && current && new Uint8Array(current).toString() !== key.toString())
    await existing.unsubscribe();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  await api("/api/push/devices", {
    body: { kind: "webpush", endpoint: json.endpoint, keys: json.keys, label: browserName() },
  });
}

/** Clicking a notification focuses the app and opens what it is about. */
export function usePushNavigation() {
  useEffect(() => {
    if (!pushSupported()) return;
    const listener = (event: MessageEvent) => {
      const link = (event.data as { type?: string; link?: string } | null)?.link;
      if (event.data?.type === "open" && typeof link === "string" && link.startsWith("/"))
        router.push(link as never);
    };
    navigator.serviceWorker.addEventListener("message", listener);
    return () => navigator.serviceWorker.removeEventListener("message", listener);
  }, []);
}
