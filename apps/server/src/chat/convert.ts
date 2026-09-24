import type { ChatMessage } from "@agent-v/shared";
import type { ModelMessage } from "ai";

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Turn a stored AG-UI thread into model messages. Tool calls whose result never arrived (for
 * example an interrupted run) are dropped, because providers reject unanswered tool calls.
 */
export function toModelMessages(history: ChatMessage[]): ModelMessage[] {
  const results = new Map<string, Extract<ChatMessage, { role: "tool" }>>();
  for (const m of history) if (m.role === "tool") results.set(m.toolCallId, m);
  const names = new Map<string, string>();
  const out: ModelMessage[] = [];
  for (const m of history) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const calls = (m.toolCalls ?? []).filter((c) => results.has(c.id));
      for (const c of calls) names.set(c.id, c.function.name);
      const content = [
        ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
        ...calls.map((c) => ({
          type: "tool-call" as const,
          toolCallId: c.id,
          toolName: c.function.name,
          input: parseJson(c.function.arguments),
        })),
      ];
      if (content.length) out.push({ role: "assistant", content });
    } else {
      const toolName = names.get(m.toolCallId);
      if (!toolName) continue;
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: m.toolCallId,
            toolName,
            output: m.error
              ? { type: "error-text", value: m.error }
              : { type: "json", value: parseJson(m.content) as never },
          },
        ],
      });
    }
  }
  return out;
}
