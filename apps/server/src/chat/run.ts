import type { BaseEvent } from "@ag-ui/core";
import type { ChatMessage, RunInput } from "@agent-v/shared";
import { isStepCount, streamText } from "ai";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { meteredModel } from "../billing/meter.ts";
import { assertQuota } from "../billing/usage.ts";
import { type Context, newId } from "../context.ts";
import { threads } from "../db/schema.ts";
import { AppError } from "../errors.ts";
import { enqueueLearning } from "../memory/service.ts";
import { chatSystemPrompt } from "../prompts.ts";
import { aiTelemetry } from "../telemetry.ts";
import { connectorChatTools } from "../tools/mcp.ts";
import { getSettings } from "../workspace.ts";
import { toAgUi } from "./agui.ts";
import { toModelMessages } from "./convert.ts";
import { appendMessages, getThread, listMessages, updateThread } from "./threads.ts";
import { chatTools } from "./tools.ts";

/**
 * One reply per chat at a time, across every API replica: a short lease on the thread row,
 * renewed while the reply streams, so a crashed replica frees the chat within a minute.
 */
const leaseSeconds = 60;
async function acquireRun(ctx: Context, userId: string, threadId: string) {
  const [row] = await ctx.db
    .update(threads)
    .set({ runningUntil: sql`now() + make_interval(secs => ${leaseSeconds})` })
    .where(
      and(
        eq(threads.id, threadId),
        eq(threads.userId, userId),
        or(isNull(threads.runningUntil), lt(threads.runningUntil, sql`now()`)),
      ),
    )
    .returning({ id: threads.id });
  if (!row) throw new AppError("A reply is already in progress in this chat", 409);
  const renew = setInterval(
    () => {
      void ctx.db
        .update(threads)
        .set({ runningUntil: sql`now() + make_interval(secs => ${leaseSeconds})` })
        .where(eq(threads.id, threadId))
        .catch(() => {});
    },
    (leaseSeconds / 3) * 1000,
  );
  return async () => {
    clearInterval(renew);
    await ctx.db
      .update(threads)
      .set({ runningUntil: null })
      .where(eq(threads.id, threadId))
      .catch((error) => console.error("[chat] could not release:", (error as Error).message));
  };
}

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
  await assertQuota(ctx, userId, "tokens");
  const release = await acquireRun(ctx, userId, threadId);
  const collected: ChatMessage[] = [];
  let userMessageId: string | null = null;
  try {
    const settings = await getSettings(ctx, userId);
    const modelId = input.model ?? settings.model;
    const model = meteredModel(ctx, userId, modelId);
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
      telemetry: aiTelemetry(ctx.config, "chat"),
      onError: () => {},
    });
    yield* toAgUi(result.stream, { threadId, runId: newId() }, collected);
  } finally {
    await appendMessages(ctx, userId, threadId, collected).catch((error) =>
      console.error("[chat] could not save messages:", (error as Error).message),
    );
    // Released after saving, so the next reply always sees this one.
    await release();
    if (collected.length) await ctx.realtime.publish(userId, { type: "thread", id: threadId });
    // Learn durable facts from what the owner said, in the background.
    if (collected.length && userMessageId)
      await enqueueLearning(userId, threadId, userMessageId).catch((error) =>
        console.warn("[memory] could not queue learning:", (error as Error).message),
      );
  }
}
