import type { WorkspaceEvent } from "@agent-v/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useLive } from "./live";

/**
 * Load a server resource and keep it fresh from the live event stream. Refetches are
 * coalesced, and a stale response never overwrites a newer one.
 */
export function useResource<T>(
  path: string | null,
  types: WorkspaceEvent["type"][],
  match?: (event: WorkspaceEvent) => boolean,
) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    const current = ++generation.current;
    try {
      const value = await api<T>(path);
      if (current === generation.current) {
        setData(value);
        setError(null);
      }
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    }
  }, [path]);

  useEffect(() => {
    setData(undefined);
    void load();
  }, [load]);

  useLive(types, (event) => {
    if (event.type !== "resync" && match && !match(event)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 60);
  });

  return { data, error, loading: data === undefined && !error, reload: load, setData };
}
