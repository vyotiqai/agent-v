import { readSse, type WorkspaceEvent } from "@agent-v/shared";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { stream } from "./api";

type Listener = (event: WorkspaceEvent | { type: "resync"; id: "" }) => void;
const listeners = new Set<Listener>();

/**
 * One server-sent event stream per device replaces polling. It reconnects with backoff, pauses
 * in the background, and asks every screen to resync after a reconnect.
 */
export function startLive(): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let attempt = 0;

  const loop = async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const body = await stream("/api/events", { signal: controller.signal });
        for await (const message of readSse(body, controller.signal)) {
          if (message.event === "ready") {
            attempt = 0;
            for (const listener of listeners) listener({ type: "resync", id: "" });
          } else if (message.event === "change") {
            const event = JSON.parse(message.data) as WorkspaceEvent;
            for (const listener of listeners) listener(event);
          }
        }
      } catch {
        // Network drop or abort; retry below.
      }
      if (stopped) break;
      attempt++;
      await new Promise((r) => setTimeout(r, Math.min(15_000, 500 * 2 ** attempt)));
    }
  };
  void loop();

  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") controller?.abort();
  });
  return () => {
    stopped = true;
    controller?.abort();
    subscription.remove();
  };
}

/** Call `handler` when a matching workspace change arrives (or after a reconnect). */
export function useLive(
  types: WorkspaceEvent["type"][],
  handler: (event: WorkspaceEvent | { type: "resync"; id: "" }) => void,
) {
  const ref = useRef(handler);
  ref.current = handler;
  const key = types.join(",");
  useEffect(() => {
    const wanted = new Set(key.split(","));
    const listener: Listener = (event) => {
      if (event.type === "resync" || wanted.has(event.type)) ref.current(event);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [key]);
}
