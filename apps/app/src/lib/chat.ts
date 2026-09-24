import { type ChatMessage, readSse } from "@agent-v/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, stream } from "./api";
import { useLive } from "./live";

interface AgUiEvent {
  type: string;
  messageId?: string;
  delta?: string;
  toolCallId?: string;
  toolCallName?: string;
  parentMessageId?: string;
  content?: string;
  message?: string;
}

/** Apply one AG-UI event to the message list, immutably, touching only the changed message. */
export function applyEvent(messages: ChatMessage[], event: AgUiEvent): ChatMessage[] {
  const replace = (index: number, message: ChatMessage) => {
    const next = messages.slice();
    next[index] = message;
    return next;
  };
  const assistantIndex = (id: string | undefined) =>
    id ? messages.findLastIndex((m) => m.id === id && m.role === "assistant") : -1;

  switch (event.type) {
    case "TEXT_MESSAGE_START": {
      if (!event.messageId || assistantIndex(event.messageId) !== -1) return messages;
      return [...messages, { id: event.messageId, role: "assistant", content: "" }];
    }
    case "TEXT_MESSAGE_CONTENT": {
      const i = assistantIndex(event.messageId);
      const current = messages[i];
      if (current?.role !== "assistant") return messages;
      return replace(i, { ...current, content: (current.content ?? "") + (event.delta ?? "") });
    }
    case "TOOL_CALL_START": {
      if (!event.toolCallId) return messages;
      const call = {
        id: event.toolCallId,
        type: "function" as const,
        function: { name: event.toolCallName ?? "tool", arguments: "" },
      };
      const i = assistantIndex(event.parentMessageId);
      const current = messages[i];
      if (current?.role === "assistant")
        return replace(i, { ...current, toolCalls: [...(current.toolCalls ?? []), call] });
      return [
        ...messages,
        { id: event.parentMessageId ?? event.toolCallId, role: "assistant", toolCalls: [call] },
      ];
    }
    case "TOOL_CALL_ARGS": {
      const i = messages.findLastIndex(
        (m) => m.role === "assistant" && m.toolCalls?.some((c) => c.id === event.toolCallId),
      );
      const current = messages[i];
      if (current?.role !== "assistant") return messages;
      return replace(i, {
        ...current,
        toolCalls: current.toolCalls?.map((c) =>
          c.id === event.toolCallId
            ? {
                ...c,
                function: { ...c.function, arguments: c.function.arguments + (event.delta ?? "") },
              }
            : c,
        ),
      });
    }
    case "TOOL_CALL_RESULT":
      return [
        ...messages,
        {
          id: event.messageId ?? `${event.toolCallId}-result`,
          role: "tool",
          toolCallId: event.toolCallId ?? "",
          content: event.content ?? "",
        },
      ];
    default:
      return messages;
  }
}

/** A chat thread: history from the server plus a live AG-UI run. */
export function useChat(threadId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The last message was refused because a plan limit was reached. */
  const [limited, setLimited] = useState(false);
  const [queued, setQueued] = useState<{ id: string; threadId: string; content: string }[]>([]);
  const controller = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const load = useCallback(async () => {
    if (!threadId) return setMessages([]);
    if (runningRef.current) return;
    try {
      setMessages(await api<ChatMessage[]>(`/api/threads/${threadId}/messages`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [threadId]);

  useEffect(() => {
    setError(null);
    void load();
  }, [load]);

  // Another device may continue this chat; pick up its messages when idle.
  useLive(["thread"], (event) => {
    if (event.type === "resync" || event.id === threadId) void load();
  });

  const run = useCallback(async (id: string, content: string) => {
    setError(null);
    setLimited(false);
    const messageId = `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    setMessages((m) => [...m, { id: messageId, role: "user", content }]);
    const abort = new AbortController();
    controller.current = abort;
    runningRef.current = true;
    setRunning(true);
    // Batch stream events per animation frame so fast token streams render smoothly.
    let pending: AgUiEvent[] = [];
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      const batch = pending;
      pending = [];
      setMessages((m) => batch.reduce(applyEvent, m));
    };
    try {
      const body = await stream(`/api/threads/${id}/runs`, {
        body: { content, messageId },
        signal: abort.signal,
      });
      for await (const message of readSse(body, abort.signal)) {
        const event = JSON.parse(message.data) as AgUiEvent;
        if (event.type === "RUN_ERROR")
          setError(event.message ?? "The agent stopped with an error");
        pending.push(event);
        frame ??= requestAnimationFrame(flush);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        // Refused before anything was saved: take the message back out.
        setMessages((m) => m.filter((x) => x.id !== messageId));
        setLimited(true);
      }
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (frame !== null) cancelAnimationFrame(frame);
      flush();
      runningRef.current = false;
      setRunning(false);
      controller.current = null;
    }
  }, []);

  /** Send now, or queue it as a follow-up when a reply is still streaming. */
  const send = useCallback(
    (id: string, content: string) => {
      if (runningRef.current)
        setQueued((q) => [...q, { id: `q${Date.now()}${q.length}`, threadId: id, content }]);
      else void run(id, content);
    },
    [run],
  );

  // Send queued follow-ups one at a time once the current reply finishes.
  useEffect(() => {
    if (running || !queued.length) return;
    const [next, ...rest] = queued;
    setQueued(rest);
    if (next) void run(next.threadId, next.content);
  }, [running, queued, run]);

  const stop = useCallback(() => {
    setQueued([]);
    controller.current?.abort();
  }, []);

  return { messages, running, queued, error, limited, send, stop, reload: load };
}
