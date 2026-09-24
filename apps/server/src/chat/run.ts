import type { BaseEvent } from "@ag-ui/core";
import type { ChatMessage, RunInput } from "@agent-v/shared";
import { isStepCount, streamText } from "ai";
import { type Context, newId } from "../context.ts";
import { AppError } from "../errors.ts";
import { enqueueLearning } from "../memory/service.ts";
import { chatSystemPrompt } from "../prompts.ts";
import { connectorChatTools } from "../tools/mcp.ts";
import { getSettings } from "../workspace.ts";
import { toAgUi } from "./agui.ts";
import { toModelMessages } from "./convert.ts";
import { appendMessages, getThread, listMessages, updateThread } from "./threads.ts";
import { chatTools } from "./tools.ts";

// One run per chat at a time (per process). Multi-instance deployments route a chat's runs to
// one instance or add an advisory lock; see docs/ARCHITECTURE.md.
const running = new Set<string>();

function titleFrom(content: string) {
  const line = content.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}

/** Run the chat agent for one user message and stream AG-UI events. */
export async function* runChat(
  ctx: Context,
  userId: string,
  threadId: string,
  input: RunInput,
  signal: AbortSignal,
): AsyncGenerator<BaseEvent> {
  const thread = await getThread(ctx, userId, threadId);
  if (running.has(threadId)) throw new AppError("A reply is already in progress in this chat", 409);
  running.add(threadId);
  const collected: ChatMessage[] = [];
  let userMessageId: string | null = null;
  try {
    const settings = await getSettings(ctx, userId);
    const modelId = input.model ?? settings.model;
    const model = ctx.models.resolve(modelId);
    const userMessage: ChatMessage = {
      id: input.messageId ?? newId(),
      role: "user",
      content: input.content,
    };
    await appendMessages(ctx, userId, threadId, [userMessage]);
    userMessageId = userMessage.id;
    await updateThread(ctx, userId, threadId, {
      touch: true,
      ...(thread.title === "New chat" ? { title: titleFrom(input.content) } : {}),
    });
    const history = await listMessages(ctx, userId, threadId);
    const result = streamText({
      model,
      system: await chatSystemPrompt(ctx, userId, input.content),
      messages: toModelMessages(history),
      tools: { ...(await connectorChatTools(ctx, userId)), ...chatTools(ctx, userId, threadId) },
      stopWhen: isStepCount(8),
      abortSignal: signal,
      maxRetries: 1,
      onError: () => {},
    });
    yield* toAgUi(result.stream, { threadId, runId: newId() }, collected);
  } finally {
    running.delete(threadId);
    await appendMessages(ctx, userId, threadId, collected).catch((error) =>
      console.error("[chat] could not save messages:", (error as Error).message),
    );
    if (collected.length) await ctx.realtime.publish(userId, { type: "thread", id: threadId });
    // Learn durable facts from what the owner said, in the background.
    if (collected.length && userMessageId)
      await enqueueLearning(userId, threadId, userMessageId).catch((error) =>
        console.warn("[memory] could not queue learning:", (error as Error).message),
      );
  }
}
