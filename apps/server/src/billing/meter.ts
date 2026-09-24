import type { LanguageModelV4, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import type { Context } from "../context.ts";
import { recordUsage } from "./usage.ts";

/** Rough tokens for text we saw (about 4 characters a token). */
const estimate = (chars: number) => Math.ceil(chars / 4);

/**
 * The model for a user's call, counting its tokens against the user's plan. Every model call
 * goes through here, so metering cannot be forgotten at a call site.
 */
export function meteredModel(ctx: Context, userId: string, modelId: string): LanguageModelV4 {
  const model = ctx.models.resolve(modelId) as LanguageModelV4;
  const record = async (input: number, output: number) => {
    if (!input && !output) return;
    await recordUsage(ctx, userId, { tokens: input + output, model: modelId, input, output }).catch(
      (error) => console.error("[usage] could not record tokens:", (error as Error).message),
    );
  };
  return wrapLanguageModel({
    model,
    middleware: {
      async wrapGenerate({ doGenerate }) {
        const result = await doGenerate();
        await record(result.usage.inputTokens.total ?? 0, result.usage.outputTokens.total ?? 0);
        return result;
      },
      async wrapStream({ doStream, params }) {
        const { stream, ...rest } = await doStream();
        const reader = stream.getReader();
        // A stream cut short (the person closed the app, or pressed stop) never reaches the
        // provider's usage report, but the provider still bills it: count an estimate instead.
        let settled = false;
        let streamed = 0;
        const settleEstimate = async () => {
          if (settled) return;
          settled = true;
          await record(estimate(JSON.stringify(params.prompt).length), estimate(streamed));
        };
        return {
          ...rest,
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            async pull(controller) {
              let next: Awaited<ReturnType<typeof reader.read>>;
              try {
                next = await reader.read();
              } catch (error) {
                await settleEstimate();
                controller.error(error);
                return;
              }
              if (next.done) {
                await settleEstimate();
                controller.close();
                return;
              }
              const part = next.value;
              if (
                part.type === "text-delta" ||
                part.type === "reasoning-delta" ||
                part.type === "tool-input-delta"
              )
                streamed += part.delta.length;
              if (part.type === "finish") {
                settled = true;
                await record(part.usage.inputTokens.total ?? 0, part.usage.outputTokens.total ?? 0);
              }
              controller.enqueue(part);
            },
            async cancel(reason) {
              await settleEstimate();
              await reader.cancel(reason);
            },
          }),
        };
      },
    },
  });
}
