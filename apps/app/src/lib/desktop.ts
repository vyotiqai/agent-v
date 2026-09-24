import type { Notification } from "@agent-v/shared";
import { api } from "./api";
import { useLive } from "./live";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

const tauri = (globalThis as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__;

/** True when this web build runs inside the Tauri desktop shell. */
export const isDesktop: boolean = tauri !== undefined;

/** Show a native desktop notification; a no-op outside the desktop app, best effort inside it. */
export async function notifyDesktop(title: string, body?: string): Promise<void> {
  if (!tauri) return;
  try {
    let granted = await tauri.invoke("plugin:notification|is_permission_granted");
    if (granted !== true)
      granted = (await tauri.invoke("plugin:notification|request_permission")) === "granted";
    if (granted) await tauri.invoke("plugin:notification|notify", { options: { title, body } });
  } catch {
    // Notifications are optional; never let them break the caller.
  }
}

/** In the desktop app, show new notifications natively (the web push service worker can't). */
export function useDesktopNotifications() {
  useLive(["notification"], (event) => {
    if (!tauri || event.type !== "notification") return;
    void api<Notification[]>("/api/notifications")
      .then((list) => {
        const found = list.find((n) => n.id === event.id);
        if (found) return notifyDesktop(found.title, found.body);
      })
      .catch(() => {});
  });
}
