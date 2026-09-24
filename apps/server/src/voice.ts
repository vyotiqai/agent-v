import { createOpenAI } from "@ai-sdk/openai";
import { transcribe } from "ai";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { assertQuota, recordUsage } from "./billing/usage.ts";
import type { Context } from "./context.ts";
import { AppError } from "./errors.ts";
import { parseModelId } from "./models/registry.ts";

const maxAudioBytes = 10 * 1024 * 1024;
const audioTypes =
  /^(audio\/(webm|ogg|mpeg|mp3|mp4|m4a|x-m4a|aac|wav|x-wav|flac)|video\/webm)(;|$)/i;

export function transcriptionAvailable(ctx: Context) {
  const id = ctx.config.transcriptionModel;
  return Boolean(id && parseModelId(id).provider === "openai" && ctx.config.providers.openai);
}

/** Speech to text with the configured model (OpenAI or any server speaking its audio API). */
export async function transcribeAudio(ctx: Context, userId: string, audio: Uint8Array) {
  const id = ctx.config.transcriptionModel;
  if (!id || !transcriptionAvailable(ctx))
    throw new AppError("Voice input needs TRANSCRIPTION_MODEL on the server", 503);
  await assertQuota(ctx, userId, "voiceMinutes");
  const openai = createOpenAI(ctx.config.providers.openai);
  try {
    const result = await transcribe({
      model: openai.transcription(parseModelId(id).model),
      audio,
      maxRetries: 1,
    });
    // Not every server reports the duration; compressed speech runs about 4 KB a second.
    const seconds = result.durationInSeconds ?? Math.max(1, audio.length / 4000);
    await recordUsage(ctx, userId, { voiceSeconds: seconds });
    return { text: result.text.trim(), language: result.language ?? null };
  } catch (error) {
    throw new AppError(`Transcription failed: ${(error as Error).message}`, 502);
  }
}

type Env = { Variables: { userId: string } };
export function voiceRoutes(app: Hono<Env>, ctx: Context) {
  app.post(
    "/api/voice/transcribe",
    bodyLimit({ maxSize: maxAudioBytes + 64 * 1024 }),
    async (c) => {
      const form = await c.req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) throw new AppError("Send the recording as a file", 422);
      const type = file.type || "audio/webm";
      if (!audioTypes.test(type)) throw new AppError(`Unsupported audio type ${type}`, 415);
      if (!file.size) throw new AppError("The recording is empty", 422);
      return c.json(
        await transcribeAudio(ctx, c.get("userId"), new Uint8Array(await file.arrayBuffer())),
      );
    },
  );
}
