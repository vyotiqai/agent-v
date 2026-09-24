import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";

/**
 * A deterministic, offline model so the whole product works with no API key: it plans,
 * calls tools and answers by simple rules. Real reasoning needs a real provider.
 */
export class DemoModel implements LanguageModelV4 {
  readonly specificationVersion = "v4";
  readonly provider = "demo";
  readonly supportedUrls = {};
  readonly modelId: string;
  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const content = respond(options);
    return {
      content,
      finishReason: finishReason(content),
      usage: usage(),
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const content = respond(options);
    const parts: LanguageModelV4StreamPart[] = [{ type: "stream-start", warnings: [] }];
    for (const part of content) {
      if (part.type === "text") {
        parts.push({ type: "text-start", id: "t0" });
        for (const word of part.text.match(/\S+\s*/g) ?? [])
          parts.push({ type: "text-delta", id: "t0", delta: word });
        parts.push({ type: "text-end", id: "t0" });
      } else parts.push(part as LanguageModelV4StreamPart);
    }
    parts.push({ type: "finish", finishReason: finishReason(content), usage: usage() });
    const signal = options.abortSignal;
    return {
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        async start(controller) {
          for (const part of parts) {
            if (signal?.aborted) break;
            controller.enqueue(part);
            // A small delay makes streaming visible in the UI.
            if (part.type === "text-delta") await new Promise((r) => setTimeout(r, 12));
          }
          controller.close();
        },
      }),
    };
  }
}

const usage = () => ({
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
});

function finishReason(content: LanguageModelV4Content[]) {
  return {
    unified: content.some((p) => p.type === "tool-call")
      ? ("tool-calls" as const)
      : ("stop" as const),
    raw: undefined,
  };
}

let counter = 0;
const call = (toolName: string, input: unknown): LanguageModelV4Content => ({
  type: "tool-call",
  toolCallId: `demo_${Date.now().toString(36)}_${(counter++).toString(36)}`,
  toolName,
  input: JSON.stringify(input),
});
const say = (text: string): LanguageModelV4Content[] => [{ type: "text", text }];

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
    .join("");
}

interface ToolOutcome {
  toolName: string;
  output: unknown;
}

function analyse(prompt: LanguageModelV4Prompt) {
  const lastUserIndex = prompt.findLastIndex((m) => m.role === "user");
  const lastUser = lastUserIndex === -1 ? "" : textOf(prompt[lastUserIndex]?.content);
  const results: ToolOutcome[] = [];
  for (const message of prompt.slice(lastUserIndex + 1))
    if (message.role === "tool")
      for (const part of message.content)
        if (part.type === "tool-result") {
          const output = part.output as { type: string; value?: unknown };
          results.push({ toolName: part.toolName, output: output.value ?? output });
        }
  return { lastUser, results, lastRole: prompt.at(-1)?.role };
}

const urlPattern = /https?:\/\/[^\s)>"']+/i;

function respond(options: LanguageModelV4CallOptions): LanguageModelV4Content[] {
  const tools = new Set((options.tools ?? []).map((t) => t.name));
  const { lastUser, results } = analyse(options.prompt);
  return tools.has("finish_task")
    ? taskTurn(lastUser, results)
    : chatTurn(lastUser, results, tools);
}

function chatTurn(input: string, results: ToolOutcome[], tools: Set<string>) {
  const done = results.at(-1);
  if (done) {
    const output = (done.output ?? {}) as Record<string, unknown>;
    if (typeof output.error === "string") return say(`That didn't work: ${output.error}`);
    if (done.toolName === "delegate_task")
      return say(
        `I've started **${String(output.title ?? "your task")}**. It keeps running in the background — follow it in Tasks, and I'll ask if I need anything.`,
      );
    if (done.toolName === "remember_fact") return say("Got it. I'll remember that.");
    if (done.toolName === "web_fetch")
      return say(
        `I read **${String(output.title || output.url)}**. Here's the start of it:\n\n${String(
          output.text ?? "",
        )
          .slice(0, 400)
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}`,
      );
    return say("Done.");
  }
  const remember = /^(?:please\s+)?remember(?:\s+that)?\s+(.{3,})$/i.exec(input.trim());
  if (remember?.[1] && tools.has("remember_fact"))
    return [call("remember_fact", { text: remember[1] })];
  const url = urlPattern.exec(input)?.[0];
  if (url && tools.has("web_fetch") && !/\b(task|monitor|watch)\b/i.test(input))
    return [call("web_fetch", { url })];
  if (
    tools.has("delegate_task") &&
    /\b(task|research|plan|organi[sz]e|prepare|draft|compare|find|book|schedule|help me)\b/i.test(
      input,
    )
  )
    return [call("delegate_task", { prompt: input, title: titleFrom(input) })];
  return say(
    "Hi! I'm running on the built-in demo model, so I follow simple rules. Try:\n\n" +
      "- **Plan a weekend trip to Lisbon** → I start a background task\n" +
      "- **Remember that I prefer window seats** → I save a memory\n" +
      "- **Summarize https://example.com** → I read the page\n\n" +
      "Choose a real model in Settings for open-ended work.",
  );
}

function taskTurn(prompt: string, results: ToolOutcome[]) {
  const called = new Set(results.map((r) => r.toolName));
  if (!called.has("set_plan"))
    return [
      call("set_plan", {
        steps: ["Understand the request", "Gather what's needed", "Write up the result"],
      }),
    ];
  const url = urlPattern.exec(prompt)?.[0];
  if (url && !called.has("web_fetch")) return [call("web_fetch", { url })];
  if (/\b(ask me|check with me|confirm with me)\b/i.test(prompt) && !called.has("ask_user"))
    return [call("ask_user", { question: "What detail should I use to finish this?" })];
  if (/\b(webhook|post to)\b/i.test(prompt) && url && !called.has("propose_webhook"))
    return [
      call("propose_webhook", {
        url,
        body: { text: `Update from Agent V: ${titleFrom(prompt)}` },
        summary: "Post the update to your webhook",
      }),
    ];
  const answer = results.find((r) => r.toolName === "ask_user")?.output as
    | { answer?: string }
    | undefined;
  const page = results.find((r) => r.toolName === "web_fetch")?.output as
    | { title?: string }
    | undefined;
  const lines = [
    `Worked on: ${prompt}`,
    page?.title ? `Read the page “${page.title}”.` : null,
    answer?.answer ? `Used your answer: ${answer.answer}.` : null,
    "This result comes from the demo model; connect a real model for real reasoning.",
  ].filter(Boolean);
  return [call("finish_task", { summary: lines.join("\n") })];
}

function titleFrom(input: string) {
  const clean = input.replace(urlPattern, "").replace(/\s+/g, " ").trim();
  const first = clean.split(/[.!?\n]/)[0] ?? clean;
  const title = first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
  return title ? title[0]?.toUpperCase() + title.slice(1) : "New task";
}
