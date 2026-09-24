import { type BaseEvent, EventType } from "@ag-ui/core";
import type { ChatMessage, ToolCall } from "@agent-v/shared";
import type { TextStreamPart, ToolSet } from "ai";
import { newId } from "../context.ts";

const stringify = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
};
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Something went wrong";

/**
 * Translate an AI SDK full stream into AG-UI 1.0 events, and collect the resulting messages
 * in AG-UI form for storage. One assistant message per model step: its text and tool calls
 * share an id, followed by one tool message per result.
 */
export async function* toAgUi(
  parts: AsyncIterable<TextStreamPart<ToolSet>>,
  run: { threadId: string; runId: string },
  collected: ChatMessage[],
): AsyncGenerator<BaseEvent> {
  yield { type: EventType.RUN_STARTED, threadId: run.threadId, runId: run.runId } as BaseEvent;

  let assistant: { id: string; content: string; toolCalls: ToolCall[] } | null = null;
  let textOpen = false;
  let toolResults: ChatMessage[] = [];
  const openCalls = new Map<string, { name: string; args: string; ended: boolean }>();

  const ensureAssistant = () => {
    assistant ??= { id: newId(), content: "", toolCalls: [] };
    return assistant;
  };
  function* closeText(): Generator<BaseEvent> {
    if (textOpen && assistant) {
      yield { type: EventType.TEXT_MESSAGE_END, messageId: assistant.id } as BaseEvent;
      textOpen = false;
    }
  }
  const flushStep = () => {
    const a = assistant as { id: string; content: string; toolCalls: ToolCall[] } | null;
    if (a && (a.content || a.toolCalls.length))
      collected.push({
        id: a.id,
        role: "assistant",
        ...(a.content ? { content: a.content } : {}),
        ...(a.toolCalls.length ? { toolCalls: a.toolCalls } : {}),
      });
    collected.push(...toolResults);
    assistant = null;
    toolResults = [];
    openCalls.clear();
  };
  function* startCall(id: string, name: string): Generator<BaseEvent> {
    yield* closeText();
    const parent = ensureAssistant();
    openCalls.set(id, { name, args: "", ended: false });
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: id,
      toolCallName: name,
      parentMessageId: parent.id,
    } as BaseEvent;
  }
  function* endCall(id: string, input?: unknown): Generator<BaseEvent> {
    const call = openCalls.get(id);
    if (!call || call.ended) return;
    if (input !== undefined && !call.args) {
      call.args = stringify(input);
      yield { type: EventType.TOOL_CALL_ARGS, toolCallId: id, delta: call.args } as BaseEvent;
    }
    call.ended = true;
    ensureAssistant().toolCalls.push({
      id,
      type: "function",
      function: { name: call.name, arguments: call.args || "{}" },
    });
    yield { type: EventType.TOOL_CALL_END, toolCallId: id } as BaseEvent;
  }

  try {
    for await (const part of parts) {
      switch (part.type) {
        case "start-step":
          assistant = null;
          break;
        case "text-delta": {
          if (!part.text) break;
          const a = ensureAssistant();
          if (!textOpen) {
            textOpen = true;
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: a.id,
              role: "assistant",
            } as BaseEvent;
          }
          a.content += part.text;
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: a.id,
            delta: part.text,
          } as BaseEvent;
          break;
        }
        case "tool-input-start":
          yield* startCall(part.id, part.toolName);
          break;
        case "tool-input-delta": {
          const call = openCalls.get(part.id);
          if (call && part.delta) {
            call.args += part.delta;
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: part.id,
              delta: part.delta,
            } as BaseEvent;
          }
          break;
        }
        case "tool-call":
          if (!openCalls.has(part.toolCallId)) yield* startCall(part.toolCallId, part.toolName);
          yield* endCall(part.toolCallId, part.input);
          break;
        case "tool-result":
        case "tool-error": {
          yield* endCall(part.toolCallId, part.input);
          const isError = part.type === "tool-error";
          const content = isError
            ? stringify({ error: errorText(part.error) })
            : stringify(part.output);
          const message: ChatMessage = {
            id: newId(),
            role: "tool",
            toolCallId: part.toolCallId,
            content,
            ...(isError ? { error: errorText(part.error) } : {}),
          };
          toolResults.push(message);
          yield {
            type: EventType.TOOL_CALL_RESULT,
            messageId: message.id,
            toolCallId: part.toolCallId,
            content,
            role: "tool",
          } as BaseEvent;
          break;
        }
        case "finish-step":
          yield* closeText();
          flushStep();
          break;
        case "error":
          throw part.error;
        case "abort":
          throw new Error("Stopped");
      }
    }
    yield* closeText();
    flushStep();
    yield { type: EventType.RUN_FINISHED, threadId: run.threadId, runId: run.runId } as BaseEvent;
  } catch (error) {
    yield* closeText();
    flushStep();
    yield { type: EventType.RUN_ERROR, message: errorText(error) } as BaseEvent;
  }
}
