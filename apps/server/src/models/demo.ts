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
      usage: usage(options.prompt, content),
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
    parts.push({
      type: "finish",
      finishReason: finishReason(content),
      usage: usage(options.prompt, content),
    });
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

/** Rough token counts (4 characters a token) so metering and quotas work offline too. */
function usage(prompt: LanguageModelV4Prompt, content: LanguageModelV4Content[]) {
  const input = Math.ceil(JSON.stringify(prompt).length / 4);
  const output = Math.ceil(JSON.stringify(content).length / 4);
  return {
    inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

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
    ? taskTurn(lastUser, results, tools)
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
    if (done.toolName === "create_goal")
      return say(
        `Saved your goal **${String(output.title)}**. Open **Goals** to add milestones, or tap **Make a plan** and I'll break it down.`,
      );
    if (done.toolName === "watch_page")
      return say(
        `I'm watching **${String(output.title)}** — ${describeWatch(output)}, checked every ${String(output.intervalMinutes)} minutes. You'll get a notification when it happens.`,
      );
    if (done.toolName === "goal_status") {
      const goals = (output.goals ?? []) as { title: string; done: number; milestones: string[] }[];
      const watches = (output.watches ?? []) as {
        title: string;
        status: string;
        matched: boolean;
      }[];
      if (!goals.length && !watches.length)
        return say("You have no goals or watches yet. Try **Set a goal to run a half marathon**.");
      return say(
        [
          ...goals.map((g) => `- **${g.title}** — ${g.done}/${g.milestones.length} milestones`),
          ...watches.map((w) => `- 👀 **${w.title}** — ${w.matched ? "condition met" : w.status}`),
        ].join("\n"),
      );
    }
    if (done.toolName === "finance_summary") return say(describeSpending(output));
    if (done.toolName === "recall_memory") {
      const found = (Array.isArray(done.output) ? done.output : []) as { text: string }[];
      return say(
        found.length
          ? `Here's what I know:\n\n${found
              .slice(0, 3)
              .map((m) => `- ${m.text}`)
              .join("\n")}`
          : "You haven't told me anything about that yet.",
      );
    }
    if (done.toolName.startsWith("mcp_")) {
      if (typeof output.actionId === "string")
        return say(`**${String(output.title)}** is ready for your approval.`);
      return say(String(output.result ?? "Done."));
    }
    if (done.toolName === "search_mail") {
      const mail = (Array.isArray(done.output) ? done.output : []) as MailRow[];
      const reply = replyIntent(input);
      if (reply && mail[0] && tools.has("propose_email"))
        return [proposeReply(mail[0], reply.body)];
      if (!mail.length) return say("I didn't find any matching email.");
      return say(
        `Here's what I found:\n\n${mail
          .slice(0, 5)
          .map(
            (m) =>
              `- **${m.subject}** — ${m.from.replace(/\s*<.*>/, "")}${m.attachments?.length ? " · 📎" : ""}`,
          )
          .join("\n")}`,
      );
    }
    if (done.toolName === "list_events") {
      const events = (Array.isArray(done.output) ? done.output : []) as {
        title: string;
        start: string;
      }[];
      if (!events.length) return say("Your calendar is clear for the next week.");
      return say(
        `Coming up:\n\n${events
          .slice(0, 6)
          .map(
            (e) =>
              `- **${e.title}** — ${e.start.length > 10 ? new Date(e.start).toUTCString().slice(0, 22) : e.start}`,
          )
          .join("\n")}`,
      );
    }
    if (done.toolName === "computer_run") {
      const out = [String(output.stdout ?? "").trim(), String(output.stderr ?? "").trim()]
        .filter(Boolean)
        .join("\n");
      return say(
        `Ran it on your computer (${String(output.status)}${output.exitCode != null ? `, exit ${String(output.exitCode)}` : ""}):\n\n\`\`\`\n${out.slice(0, 1500) || "(no output)"}\n\`\`\``,
      );
    }
    if (done.toolName === "propose_email" || done.toolName === "propose_event")
      return say(
        `I've prepared **${String(output.title ?? "it")}**. Review it below; nothing happens until you approve.`,
      );
    if (done.toolName === "web_fetch" || done.toolName === "browse")
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
  const connector = connectorIntent(input, tools);
  if (connector) return [connector];
  const recall = /^what do you (?:know|remember) about (.+?)\??$/i.exec(input.trim());
  if (recall?.[1] && tools.has("recall_memory"))
    return [call("recall_memory", { query: recall[1] })];
  const goal = /^(?:set (?:a |my )?goal(?: to)?|new goal:?|my goal is(?: to)?)\s+(.{3,})$/i.exec(
    input.trim(),
  );
  if (goal?.[1] && tools.has("create_goal"))
    return [call("create_goal", { title: capitalize(goal[1].replace(/[.!]$/, "")) })];
  const watch = watchIntent(input);
  if (watch && tools.has("watch_page")) return [call("watch_page", watch)];
  if (
    tools.has("goal_status") &&
    /\b(my goals|goal progress|how are my goals|what am i (?:tracking|watching)|my watches)\b/i.test(
      input,
    )
  )
    return [call("goal_status", {})];
  if (
    tools.has("finance_summary") &&
    /\b(spend|spent|spending|budget|subscriptions?|recurring charges)\b/i.test(input)
  ) {
    const on = /\bon ([\w .'&-]{2,40}?)\??$/i.exec(input.trim())?.[1];
    return [call("finance_summary", on ? { filter: on } : {})];
  }
  const remember = /^(?:please\s+)?remember(?:\s+that)?\s+(.{3,})$/i.exec(input.trim());
  if (remember?.[1] && tools.has("remember_fact"))
    return [call("remember_fact", { text: remember[1] })];
  const url = urlPattern.exec(input)?.[0];
  const reader = tools.has("browse") ? "browse" : "web_fetch";
  if (url && tools.has(reader) && !/\b(task|monitor|watch)\b/i.test(input))
    return [call(reader, { url })];
  const command = commandIntent(input);
  if (command && tools.has("computer_run")) return [call("computer_run", { command })];
  const reply = replyIntent(input);
  if (reply && tools.has("search_mail")) return [call("search_mail", { query: reply.name })];
  const addEvent = /^add (.+?) to my calendar(?: on (\d{4}-\d{2}-\d{2}))?/i.exec(input.trim());
  if (addEvent?.[1] && tools.has("propose_event")) {
    const start = addEvent[2] ?? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.parse(start) + 86_400_000).toISOString().slice(0, 10);
    return [call("propose_event", { title: addEvent[1], start, end, allDay: true })];
  }
  if (
    tools.has("list_events") &&
    /\b(calendar|agenda|schedule this week|what'?s on)\b/i.test(input)
  )
    return [call("list_events", { days: 7 })];
  if (
    tools.has("search_mail") &&
    /\b(inbox|emails?|mail)\b/i.test(input) &&
    !/\b(permission|form|slip|task)\b/i.test(input)
  )
    return [call("search_mail", { query: "" })];
  if (
    tools.has("delegate_task") &&
    /\b(task|research|plan|organi[sz]e|prepare|draft|compare|find|book|schedule|help me|complete|fill|permission slip)\b/i.test(
      input,
    )
  )
    return [call("delegate_task", { prompt: input, title: titleFrom(input) })];
  return say(
    "Hi! I'm running on the built-in demo model, so I follow simple rules. Try:\n\n" +
      "- **Plan a weekend trip to Lisbon** → I start a background task\n" +
      "- **Remember that I prefer window seats** → I save a memory\n" +
      "- **Summarize https://example.com** → I read the page\n" +
      "- **What's in my inbox?** / **What's on my calendar?**\n" +
      "- **Reply to Sam: count me in!** → I prepare a reply for your approval\n" +
      "- **Complete the permission slip** → I fill the PDF and prepare the reply\n" +
      "- **Set a goal to run a half marathon** → I save a goal\n" +
      "- **Watch demo://price and tell me when it's below $300** → I watch the page\n" +
      "- **How much did I spend on dining?** → after importing transactions in Goals → Money\n\n" +
      "Choose a real model in Settings for open-ended work.",
  );
}

function taskTurn(prompt: string, results: ToolOutcome[], tools: Set<string>) {
  const called = new Set(results.map((r) => r.toolName));
  const paperwork = /\b(permission|slip|form)\b/i.test(prompt) && tools.has("search_mail");
  const planGoal = tools.has("add_goal_milestones")
    ? /make a plan for my goal "([^"]+)"/i.exec(prompt)?.[1]
    : undefined;
  const replyTo = tools.has("search_mail") ? /^reply to (.+?) about “(.+?)”/i.exec(prompt) : null;
  const money =
    tools.has("finance_summary") && /\b(recurring charges|finance_summary)\b/i.test(prompt);
  if (!called.has("set_plan"))
    return [
      call("set_plan", {
        steps: paperwork
          ? [
              "Find the form in your inbox",
              "Fill it in with your details",
              "Send it back after your review",
            ]
          : planGoal
            ? ["Break the goal into milestones", "Save them to the goal"]
            : replyTo
              ? ["Read the email", "Check your calendar", "Ask what to say", "Prepare the reply"]
              : money
                ? ["Read your spending summary", "Suggest what to cut"]
                : ["Understand the request", "Gather what's needed", "Write up the result"],
      }),
    ];
  const watch = tools.has("watch_page") ? watchIntent(prompt) : null;
  if (watch && !called.has("watch_page")) return [call("watch_page", watch)];
  if (watch) {
    const made = results.findLast((r) => r.toolName === "watch_page")?.output as
      | Record<string, unknown>
      | undefined;
    return [
      call("finish_task", {
        summary: made?.error
          ? `Could not start the watch: ${String(made.error)}`
          : `Watching ${String(made?.title)}: ${describeWatch(made ?? {})}.`,
      }),
    ];
  }
  const connector = connectorIntent(prompt, tools);
  if (connector && !results.some((r) => r.toolName.startsWith("mcp_"))) return [connector];
  const used = results.findLast((r) => r.toolName.startsWith("mcp_"))?.output as
    | { result?: string; status?: string; error?: string }
    | undefined;
  if (connector && used)
    return [
      call("finish_task", {
        summary: used.error
          ? `The connector call failed: ${used.error}`
          : (used.result ?? `The connector call ${used.status ?? "finished"}.`),
      }),
    ];
  if (planGoal) {
    if (!called.has("add_goal_milestones"))
      return [
        call("add_goal_milestones", {
          milestones: [
            `Decide what success looks like for “${planGoal}”`,
            "Choose a start date and a weekly routine",
            "Do the first small step this week",
            "Review progress after two weeks",
          ],
        }),
      ];
    const saved = results.findLast((r) => r.toolName === "add_goal_milestones")?.output as
      | { milestones?: string[]; error?: string }
      | undefined;
    return [
      call("finish_task", {
        summary: saved?.error
          ? `Could not save the plan: ${saved.error}`
          : `Planned “${planGoal}” with ${saved?.milestones?.length ?? 0} milestones:\n${(saved?.milestones ?? []).map((m) => `- ${m}`).join("\n")}`,
      }),
    ];
  }
  if (replyTo) {
    const flow = replyTaskTurn(replyTo[1] ?? "", results, called);
    if (flow) return flow;
  }
  if (money) {
    if (!called.has("finance_summary")) return [call("finance_summary", {})];
    const output = results.findLast((r) => r.toolName === "finance_summary")?.output as
      | Record<string, unknown>
      | undefined;
    return [call("finish_task", { summary: describeSpending(output ?? {}, true) })];
  }
  if (paperwork) {
    const paperwork = paperworkTurn(results, called);
    if (paperwork) return paperwork;
  }
  const command = commandIntent(prompt);
  if (command && tools.has("computer_run") && !called.has("computer_run"))
    return [call("computer_run", { command })];
  const url = urlPattern.exec(prompt)?.[0];
  const reader = tools.has("browse") ? "browse" : "web_fetch";
  if (url && !called.has(reader) && !/\b(webhook|post to)\b/i.test(prompt))
    return [call(reader, { url })];
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
  const page = results.find((r) => r.toolName === "web_fetch" || r.toolName === "browse")?.output as
    | { title?: string }
    | undefined;
  const ran = results.find((r) => r.toolName === "computer_run")?.output as
    | { stdout?: string; exitCode?: number | null }
    | undefined;
  const lines = [
    `Worked on: ${prompt}`,
    ran
      ? `Command output (exit ${String(ran.exitCode)}):\n${String(ran.stdout ?? "")
          .trim()
          .slice(0, 1000)}`
      : null,
    page?.title ? `Read the page “${page.title}”.` : null,
    answer?.answer ? `Used your answer: ${answer.answer}.` : null,
    "This result comes from the demo model; connect a real model for real reasoning.",
  ].filter(Boolean);
  return [call("finish_task", { summary: lines.join("\n") })];
}

interface MailRow {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  attachments?: { id: string; name: string }[];
}

/** "Run `ls -la` on my computer" → "ls -la" */
function commandIntent(input: string) {
  if (!/\b(run|execute|terminal|computer|shell)\b/i.test(input)) return null;
  return /`([^`]{1,2000})`/.exec(input)?.[1]?.trim() || null;
}

/** "Reply to Sam: count me in" → { name: "Sam", body: "count me in" } */
function replyIntent(input: string) {
  const match = /^reply to ([\w .'-]{2,40}?)\s*[:,-]\s*(.+)$/is.exec(input.trim());
  return match?.[1] && match[2] ? { name: match[1].trim(), body: match[2].trim() } : null;
}

const emailOf = (from: string) => /<([^>]+)>/.exec(from)?.[1] ?? from.trim();

function proposeReply(mail: MailRow, body: string, attachmentIds: string[] = []) {
  return call("propose_email", {
    to: [emailOf(mail.from)],
    subject: /^re:/i.test(mail.subject) ? mail.subject : `Re: ${mail.subject}`,
    body,
    attachmentIds,
    replyTo: { threadId: mail.threadId, messageId: mail.id },
  });
}

/** Find the form in the inbox, fill it with the owner's answers, and prepare the reply. */
function paperworkTurn(results: ToolOutcome[], called: Set<string>) {
  const output = (name: string) =>
    results.findLast((r) => r.toolName === name)?.output as Record<string, unknown> | undefined;
  if (!called.has("search_mail")) return [call("search_mail", { query: "permission slip" })];
  const mail = (results.find((r) => r.toolName === "search_mail")?.output ?? []) as MailRow[];
  const source = Array.isArray(mail) ? mail.find((m) => m.attachments?.length) : undefined;
  if (!source) return null;
  if (!called.has("read_email_thread"))
    return [call("read_email_thread", { threadId: source.threadId })];
  const attachment = source.attachments?.[0];
  if (!called.has("import_attachment") && attachment)
    return [call("import_attachment", { messageId: source.id, attachmentId: attachment.id })];
  const imported = output("import_attachment") as
    | { fileId?: string; fields?: { name: string; type: string }[] }
    | undefined;
  if (!imported?.fileId) return null;
  const fields = (imported.fields ?? []).filter((f) => f.type !== "unsupported");
  const completed = results.filter((r) => r.toolName === "complete_step").length;
  if (completed < 1) return [call("complete_step", { index: 0 })];
  if (!called.has("ask_user"))
    return [
      call("ask_user", {
        question: `Which values should I put on the form? Fields: ${fields
          .map((f) => (f.type === "checkbox" ? `${f.name} (yes/no)` : f.name))
          .join(
            ", ",
          )}. Reply like “${fields[0]?.name ?? "Name"}: …; ${fields[1]?.name ?? "Other"}: …”.`,
      }),
    ];
  const answer = String((output("ask_user") as { answer?: string } | undefined)?.answer ?? "");
  if (!called.has("fill_pdf")) {
    const values: Record<string, string | boolean> = {};
    for (const piece of answer.split(/[;\n]/)) {
      const [key, ...rest] = piece.split(":");
      const field = fields.find((f) => f.name.toLowerCase() === key?.trim().toLowerCase());
      const value = rest.join(":").trim();
      if (field && value)
        values[field.name] = field.type === "checkbox" ? /^(y|yes|true|x)/i.test(value) : value;
    }
    return [call("fill_pdf", { fileId: imported.fileId, values })];
  }
  const filled = output("fill_pdf") as { fileId?: string; error?: string } | undefined;
  if (!filled?.fileId) return null;
  if (completed < 2) return [call("complete_step", { index: 1 })];
  if (!called.has("propose_email"))
    return [
      proposeReply(
        source,
        "Hello,\n\nPlease find the completed permission slip attached.\n\nThank you!",
        [filled.fileId],
      ),
    ];
  const sent = output("propose_email") as { status?: string } | undefined;
  return [
    call("finish_task", {
      summary:
        sent?.status === "succeeded"
          ? `Filled in “${attachment?.name ?? "the form"}” and sent it back to ${emailOf(source.from)}.`
          : `Filled in “${attachment?.name ?? "the form"}”. The reply was ${sent?.status ?? "not sent"}; the filled copy is in Files.`,
    }),
  ];
}

function titleFrom(input: string) {
  const clean = input.replace(urlPattern, "").replace(/\s+/g, " ").trim();
  const first = clean.split(/[.!?\n]/)[0] ?? clean;
  const title = first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
  return title ? title[0]?.toUpperCase() + title.slice(1) : "New task";
}

function capitalize(text: string) {
  return text ? text[0]?.toUpperCase() + text.slice(1) : text;
}

/** "Watch https://shop.example/x and tell me when it's below $300" → a watch_page call. */
function watchIntent(input: string) {
  if (!/\b(watch|track|monitor|alert me|let me know when|tell me when)\b/i.test(input)) return null;
  const url = /(https?:\/\/[^\s)>"']+|demo:\/\/[a-z]+)/i.exec(input)?.[1]?.replace(/[.,]$/, "");
  if (!url) return null;
  const price =
    /\b(?:below|under|less than|drops? (?:below|under|to))\s*(?:[$€£₹]|usd|eur|gbp|inr)?\s*(\d+(?:\.\d+)?)/i.exec(
      input,
    )?.[1];
  const text = /["“]([^"”]{1,200})["”]/.exec(input)?.[1];
  const every = /\bevery (\d+) (minute|hour)s?\b/i.exec(input);
  const minutes = every ? Number(every[1]) * (/hour/i.test(every[2] ?? "") ? 60 : 1) : 60;
  const host = url.startsWith("demo://") ? url : new URL(url).hostname.replace(/^www\./, "");
  return {
    title: price ? `Price on ${host}` : text ? `“${text}” on ${host}` : `Changes on ${host}`,
    url,
    condition: price ? "price_below" : text ? "contains" : "change",
    ...(price ? { value: price } : text ? { value: text } : {}),
    intervalMinutes: Math.min(Math.max(minutes, 5), 10_080),
  };
}

function describeWatch(output: Record<string, unknown>) {
  if (output.condition === "price_below")
    return `alerting when the price drops below ${String(output.value)}`;
  if (output.condition === "contains") return `alerting when “${String(output.value)}” appears`;
  return "alerting when the page changes";
}

function describeSpending(output: Record<string, unknown>, suggest = false) {
  if (typeof output.error === "string") return output.error;
  const r = output.report as
    | {
        name: string;
        currency: string | null;
        period: { from: string; to: string };
        income: number;
        spending: number;
        categories: { name: string; amount: number }[];
        recurring: { merchant: string; amount: number }[];
      }
    | undefined;
  if (!r) return "I couldn't read your spending.";
  const money = (n: number) => `${r.currency ? `${r.currency} ` : ""}${n.toFixed(2)}`;
  const filter = output.filter as { text: string; count: number; spent: number } | undefined;
  if (filter && !suggest)
    return `You spent **${money(filter.spent)}** on ${filter.text} across ${filter.count} transactions (${r.period.from} to ${r.period.to}).`;
  const lines = [
    `From **${r.name}** (${r.period.from} to ${r.period.to}): spent **${money(r.spending)}**, received **${money(r.income)}**.`,
    `Top categories: ${r.categories
      .slice(0, 3)
      .map((c) => `${c.name} ${money(c.amount)}`)
      .join(", ")}.`,
  ];
  if (r.recurring.length)
    lines.push(
      suggest
        ? `Recurring charges to review:\n${r.recurring
            .map((c) => `- ${c.merchant}: ${money(c.amount)} a month`)
            .join(
              "\n",
            )}\nThe smaller subscriptions are the easiest to cancel; together they add up to ${money(
            r.recurring.filter((c) => c.amount < 50).reduce((sum, c) => sum + c.amount, 0),
          )} a month.`
        : `${r.recurring.length} charges repeat monthly.`,
    );
  return lines.join("\n\n");
}

/** Read the email, check the calendar, ask the owner what to say, then prepare the reply. */
function replyTaskTurn(name: string, results: ToolOutcome[], called: Set<string>) {
  const output = (tool: string) => results.findLast((r) => r.toolName === tool)?.output;
  if (!called.has("search_mail")) return [call("search_mail", { query: name })];
  const mail = output("search_mail");
  const source = Array.isArray(mail) ? (mail[0] as MailRow | undefined) : undefined;
  if (!source) return [call("finish_task", { summary: `I couldn't find the email from ${name}.` })];
  if (!called.has("list_events")) return [call("list_events", { days: 7 })];
  if (!called.has("ask_user"))
    return [
      call("ask_user", {
        question: `What should I tell ${name} about “${source.subject}”? I checked your calendar for the week.`,
      }),
    ];
  const answer = String((output("ask_user") as { answer?: string } | undefined)?.answer ?? "");
  if (!called.has("propose_email")) return [proposeReply(source, answer)];
  const sent = output("propose_email") as { status?: string } | undefined;
  return [
    call("finish_task", {
      summary:
        sent?.status === "succeeded"
          ? `Replied to ${name}: “${answer}”.`
          : `The reply to ${name} was ${sent?.status ?? "not sent"}.`,
    }),
  ];
}

/** Sample-connector phrases → their tools, when the owner has the sample connector. */
function connectorIntent(input: string, tools: Set<string>) {
  const find = (suffix: string) =>
    [...tools].find((t) => t.startsWith("mcp_") && t.endsWith(suffix));
  const convert = /\bconvert ([\d.]+) ?([a-z]+) (?:to|in|into) ([a-z]+)\b/i.exec(input);
  if (convert && find("_convert_units"))
    return call(find("_convert_units") as string, {
      value: Number(convert[1]),
      from: convert[2],
      to: convert[3],
    });
  const weather = /\bweather (?:in|for) ([\p{L} .'-]{2,40}?)[?.!]*$/iu.exec(input.trim());
  if (weather && find("_weather")) return call(find("_weather") as string, { city: weather[1] });
  const note = /\bsave (?:a )?note:?\s+(.{1,500})$/is.exec(input.trim());
  if (note && find("_save_note")) return call(find("_save_note") as string, { text: note[1] });
  if (/\b(list|show|read) my notes\b/i.test(input) && find("_list_notes"))
    return call(find("_list_notes") as string, {});
  return null;
}
