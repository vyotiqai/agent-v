import { createHash } from "node:crypto";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { type EmbeddingModel, embedMany } from "ai";
import type { Config } from "../config.ts";
import { AppError } from "../errors.ts";
import { parseModelId } from "../models/registry.ts";
import { aiTelemetry } from "../telemetry.ts";

export interface Embedder {
  /** Stored with each vector: vectors from different models are never compared. */
  id: string;
  embed(texts: string[]): Promise<number[][]>;
}

const hashDimensions = 512;
const stopWords = new Set(
  "a an and are as at be but by do does for from has have i i'm in is it its me my of on or our so that the their them they this to was we what when where which who why will with you your".split(
    " ",
  ),
);

/** Light stemming so "prefers", "preferred" and "preference" land near each other. */
const stem = (word: string) =>
  word.replace(/(?:ing|ed|es|s|ence|ences|ly)$/, "").replace(/(.)\1$/, "$1") || word;

/**
 * An offline embedding: hashed word stems, word pairs and character trigrams, signed and
 * normalized. It captures shared wording, not meaning; real models do much better.
 */
export function hashEmbedding(text: string): number[] {
  const vector = new Array<number>(hashDimensions).fill(0);
  const words = (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
    .filter((w) => !stopWords.has(w))
    .map(stem);
  const add = (feature: string, weight: number) => {
    const h = createHash("sha256").update(feature).digest();
    const index = h.readUInt32BE(0) % hashDimensions;
    vector[index] = (vector[index] ?? 0) + ((h[4] ?? 0) & 1 ? weight : -weight);
  };
  for (const [i, word] of words.entries()) {
    add(`w:${word}`, 1);
    if (words[i + 1]) add(`b:${word} ${words[i + 1]}`, 0.5);
    const padded = ` ${word} `;
    for (let j = 0; j + 3 <= padded.length; j++) add(`c:${padded.slice(j, j + 3)}`, 0.25);
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((v) => v / norm);
}

export function createEmbedder(config: Config): Embedder {
  const id = config.embeddingModel;
  if (id === "demo/hash") return { id, embed: async (texts) => texts.map((t) => hashEmbedding(t)) };
  const { provider, model } = parseModelId(id);
  let embeddingModel: EmbeddingModel;
  if (provider === "openai" && config.providers.openai)
    embeddingModel = createOpenAI(config.providers.openai).embeddingModel(model);
  else if (provider === "google" && config.providers.google)
    embeddingModel = createGoogleGenerativeAI(config.providers.google).embeddingModel(model);
  else {
    const compat = config.providers.compat.find((p) => p.name === provider);
    if (!compat) throw new Error(`EMBEDDING_MODEL "${id}" needs a configured provider`);
    embeddingModel = createOpenAICompatible({
      name: compat.name,
      baseURL: compat.baseURL,
      apiKey: compat.apiKey,
    }).embeddingModel(model);
  }
  return {
    id,
    async embed(texts) {
      if (!texts.length) return [];
      try {
        const { embeddings } = await embedMany({
          model: embeddingModel,
          values: texts,
          maxRetries: 2,
          telemetry: aiTelemetry(config, "embed"),
        });
        return embeddings;
      } catch (error) {
        throw new AppError(`Embedding failed: ${(error as Error).message}`, 502);
      }
    },
  };
}
