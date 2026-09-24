import type { ModelOption } from "@agent-v/shared";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { Config } from "../config.ts";
import { AppError } from "../errors.ts";
import { DemoModel } from "./demo.ts";

export interface Models {
  /** Resolve a "provider/model" id to a model, or throw if it is not available. */
  resolve(id: string): LanguageModel;
  options(): ModelOption[];
  isAllowed(id: string): boolean;
  defaultModel: string;
}

export function parseModelId(id: string): { provider: string; model: string } {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1)
    throw new AppError(`Model "${id}" must look like provider/model`, 422);
  return { provider: id.slice(0, slash), model: id.slice(slash + 1) };
}

export function createModels(config: Config): Models {
  const { providers } = config;
  const factories = new Map<string, (model: string) => LanguageModel>();
  if (providers.openai) {
    const openai = createOpenAI(providers.openai);
    factories.set("openai", (m) => openai(m));
  }
  if (providers.anthropic) {
    const anthropic = createAnthropic(providers.anthropic);
    factories.set("anthropic", (m) => anthropic(m));
  }
  if (providers.google) {
    const google = createGoogleGenerativeAI(providers.google);
    factories.set("google", (m) => google(m));
  }
  for (const compat of providers.compat) {
    const provider = createOpenAICompatible({
      name: compat.name,
      baseURL: compat.baseURL,
      apiKey: compat.apiKey,
    });
    factories.set(compat.name, (m) => provider.chatModel(m));
  }
  if (config.demoModel) factories.set("demo", (m) => new DemoModel(m));

  const listed = [
    ...config.allowedModels,
    ...providers.compat.flatMap((p) => p.models.map((m) => `${p.name}/${m}`)),
    ...(config.demoModel ? ["demo/agent-v"] : []),
  ];
  const available = [...new Set(listed)].filter((id) => {
    try {
      return factories.has(parseModelId(id).provider);
    } catch {
      return false;
    }
  });

  return {
    defaultModel: available.includes(config.defaultModel)
      ? config.defaultModel
      : (available[0] ?? config.defaultModel),
    isAllowed: (id) => available.includes(id),
    options: () =>
      available.map((id) => ({
        id,
        label: id === "demo/agent-v" ? "Demo (offline, rule-based)" : id,
      })),
    resolve(id) {
      if (!available.includes(id)) throw new AppError(`Model "${id}" is not enabled`, 422);
      const { provider, model } = parseModelId(id);
      const factory = factories.get(provider);
      if (!factory) throw new AppError(`Provider "${provider}" is not configured`, 422);
      return factory(model);
    },
  };
}
