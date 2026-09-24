import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

export interface Frame {
  uri: string;
  width: number;
  height: number;
}

export type BrowserInput =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "scroll"; dy: number }
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" };

/**
 * Live view of a cloud browser: JPEG frames stream in over a WebSocket, input goes back out.
 * Reconnects with a fresh signed URL if the connection drops.
 */
export function useLiveBrowser(sessionId: string) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [page, setPage] = useState({ url: "", title: "" });
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [error, setError] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = async () => {
      setStatus("connecting");
      try {
        const { url } = await api<{ url: string }>(`/api/browsers/${sessionId}/live`, { body: {} });
        if (stopped) return;
        const ws = new WebSocket(url);
        socket.current = ws;
        ws.onopen = () => {
          attempt = 0;
          setStatus("live");
          setError(null);
        };
        ws.onmessage = (event) => {
          const message = JSON.parse(String(event.data)) as
            | { type: "frame"; data: string; width: number; height: number }
            | { type: "page"; url: string; title: string }
            | { type: "error"; message: string };
          if (message.type === "frame")
            setFrame({
              uri: `data:image/jpeg;base64,${message.data}`,
              width: message.width,
              height: message.height,
            });
          else if (message.type === "page") setPage({ url: message.url, title: message.title });
          else setError(message.message);
        };
        ws.onclose = () => {
          socket.current = null;
          if (stopped) return;
          setStatus("offline");
          timer = setTimeout(() => void connect(), Math.min(10_000, 500 * 2 ** attempt++));
        };
      } catch (e) {
        setError((e as Error).message);
        setStatus("offline");
        if (!stopped)
          timer = setTimeout(() => void connect(), Math.min(10_000, 1000 * 2 ** attempt++));
      }
    };
    void connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket.current?.close();
    };
  }, [sessionId]);

  const send = useCallback((input: BrowserInput) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(input));
  }, []);

  return { frame, page, status, error, send };
}
