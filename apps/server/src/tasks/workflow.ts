import type { PlanStep } from "@agent-v/shared";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { generateText, type ModelMessage, tool } from "ai";
import { z } from "zod";
import {
  type ActionKind,
  executeAction,
  expireAction,
  getAction,
  proposeAction,
} from "../actions.ts";
import { meteredModel } from "../billing/meter.ts";
import { assertQuota } from "../billing/usage.ts";
import { browseForAgent, scopedAgentAction } from "../browser/service.ts";
import { type Context, newId } from "../context.ts";
import { AppError } from "../errors.ts";
import { recordGoalProgress } from "../goals/service.ts";
import { connectorToolsFor } from "../mcp/service.ts";
import { taskSystemPrompt } from "../prompts.ts";
import { aiTelemetry } from "../telemetry.ts";
import { computerDescriptions, computerSchemas, runComputerTool } from "../tools/computer.ts";
import { lifeDescriptions, lifeSchemas, runLifeTool } from "../tools/life.ts";
import { proposalFor, runAutoTool, toolSchema } from "../tools/mcp.ts";
import { readWebPage } from "../tools/web.ts";
import { workspaceDescriptions, workspaceSchemas, workspaceTools } from "../tools/workspace.ts";

const workspaceEventTitle = {
  search_mail: "Searched mail",
  read_email_thread: "Read an email thread",
  list_events: "Checked the calendar",
  import_attachment: "Saved an attachment to Files",
  inspect_pdf: "Inspected a PDF",
  fill_pdf: "Saved a filled copy",
} as const;

import { addMemory, notify } from "../workspace.ts";
import { addEvent, getTaskRow, updateTask } from "./service.ts";

export const taskQueue = "tasks";
const maxTurns = 24;
const answerTimeoutSeconds = 30 * 24 * 60 * 60;

let context: Context | undefined;
/** Workflows are registered at import time, so their dependencies are provided before launch. */
export function setTaskContext(ctx: Context) {
  context = ctx;
}
function ctx(): Context {
  if (!context) throw new Error("Task context is not configured");
  return context;
}

// Tool definitions the model sees. Execution happens in the workflow so each call is a
// checkpointed step and waits for people are durable.
const allTaskTools = {
  set_plan: tool({
    description: "Set the concrete plan for this task (2-8 steps).",
    inputSchema: z.object({ steps: z.array(z.string().min(1).max(200)).min(1).max(8) }),
  }),
  complete_step: tool({
    description: "Mark a plan step as done by its zero-based index.",
    inputSchema: z.object({ index: z.number().int().min(0).max(7) }),
  }),
  web_fetch: tool({
    description: "Read a public web page as text. Returns url, title and text, or an error.",
    inputSchema: z.object({ url: z.url().max(4096) }),
  }),
  remember_fact: tool({
    description: "Save a preference the owner stated, for future work.",
    inputSchema: z.object({ text: z.string().min(1).max(2000) }),
  }),
  ask_user: tool({
    description: "Pause and ask the owner for a missing fact or decision.",
    inputSchema: z.object({ question: z.string().min(1).max(2000) }),
  }),
  propose_webhook: tool({
    description:
      "Propose POSTing JSON to a webhook URL the owner gave you. The owner must approve it.",
    inputSchema: z.object({
      url: z.url().max(4096),
      body: z.record(z.string(), z.unknown()),
      summary: z.string().min(1).max(500),
    }),
  }),
  ...(Object.fromEntries(
    (Object.keys(workspaceSchemas) as (keyof typeof workspaceSchemas)[]).map((key) => [
      key,
      tool({
        description: workspaceDescriptions[key],
        inputSchema: workspaceSchemas[key] as z.ZodType,
      }),
    ]),
  ) as { [K in keyof typeof workspaceSchemas]: ReturnType<typeof tool> }),
  ...(Object.fromEntries(
    (Object.keys(computerSchemas) as (keyof typeof computerSchemas)[]).map((key) => [
      key,
      tool({
        description: computerDescriptions[key],
        inputSchema: computerSchemas[key] as z.ZodType,
      }),
    ]),
  ) as { [K in keyof typeof computerSchemas]: ReturnType<typeof tool> }),
  add_goal_milestones: tool({
    description: lifeDescriptions.add_goal_milestones,
    inputSchema: lifeSchemas.add_goal_milestones,
  }),
  goal_status: tool({
    description: lifeDescriptions.goal_status,
    inputSchema: lifeSchemas.goal_status,
  }),
  watch_page: tool({
    description: lifeDescriptions.watch_page,
    inputSchema: lifeSchemas.watch_page,
  }),
  finance_summary: tool({
    description: lifeDescriptions.finance_summary,
    inputSchema: lifeSchemas.finance_summary,
  }),
  finish_task: tool({
    description: "Finish the task with a summary of the outcome for the owner.",
    inputSchema: z.object({ summary: z.string().min(1).max(8000) }),
  }),
  browse: tool({
    description:
      "Open a public URL in this task's cloud browser (real Chromium, runs JavaScript) and read it. Returns url, title and text, or an error.",
    inputSchema: z.object({ url: z.url().max(4096) }),
  }),
  click_link: tool({
    description: "Follow a link on the current page by its visible text and read the new page.",
    inputSchema: z.object({ name: z.string().min(1).max(300) }),
  }),
  read_page: tool({
    description: "Read the browser's current page again.",
    inputSchema: z.object({}),
  }),
};
type TaskToolName = keyof typeof allTaskTools;

/** With a browser worker the agent gets the real browser; otherwise the plain fetcher. */
function taskTools(c: Context) {
  const { browse, click_link, read_page, web_fetch, ...rest } = allTaskTools;
  const tools: Record<string, unknown> = c.browser
    ? { ...rest, browse, click_link, read_page }
    : { ...rest, web_fetch };
  if (!c.config.computer) for (const name of Object.keys(computerSchemas)) delete tools[name];
  return tools as typeof allTaskTools;
}

interface ModelCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}
interface ModelReply {
  text: string;
  toolCalls: ModelCall[];
}

async function nextStep(
  userId: string,
  model: string,
  messages: ModelMessage[],
): Promise<ModelReply> {
  // A task stops (and can be retried later) when the month's AI allowance runs out.
  await assertQuota(ctx(), userId, "tokens");
  const result = await generateText({
    model: meteredModel(ctx(), userId, model),
    system: await taskSystemPrompt(
      ctx(),
      userId,
      messages[0] && typeof messages[0].content === "string" ? messages[0].content : "",
    ),
    messages,
    tools: {
      ...Object.fromEntries(
        (await connectorToolsFor(ctx(), userId)).map((t) => [
          t.name,
          tool({ description: t.description, inputSchema: toolSchema(t) }),
        ]),
      ),
      ...taskTools(ctx()),
    },
    maxRetries: 0,
    telemetry: aiTelemetry(ctx().config, "task"),
  });
  return {
    text: result.text,
    toolCalls: result.toolCalls.map((c) => ({
      toolCallId: c.toolCallId,
      toolName: c.toolName,
      input: c.input,
    })),
  };
}

const step = <T>(name: string, fn: () => Promise<T>) => DBOS.runStep(fn, { name });

async function waitingFor<T>(topic: string, timeoutSeconds: number): Promise<T | null> {
  return DBOS.recv<T>(topic, { timeoutSeconds });
}

/**
 * Propose an external write, wait (durably) for the owner's decision, and run it if approved.
 * Each phase is its own step, so a replay never proposes or executes twice.
 */
async function proposeAndWait(
  userId: string,
  taskId: string,
  id: string,
  kind: ActionKind,
  payload: Record<string, unknown>,
  summary?: string,
) {
  const c = ctx();
  const proposal = await step(`propose:${id}`, async () => {
    let proposed: Awaited<ReturnType<typeof proposeAction>>;
    try {
      proposed = await proposeAction(c, userId, {
        id: `${taskId}:${id}`,
        taskId,
        kind,
        payload,
        summary,
      });
    } catch (error) {
      return { error: (error as Error).message };
    }
    await updateTask(
      c,
      userId,
      taskId,
      { status: "waiting_approval", actionId: proposed.id },
      { kind: "status", title: "Waiting for your approval", detail: proposed.summary },
    );
    await notify(c, userId, {
      title: "Ready for your review",
      category: "needs_you",
      body: proposed.summary,
      taskId,
      dedupeKey: `review:${proposed.id}`,
    });
    return { action: proposed };
  });
  if ("error" in proposal) return proposal;
  const action = proposal.action;
  const seconds = Math.max(
    1,
    Math.ceil((Date.parse(action.expiresAt) - (await DBOS.now())) / 1000),
  );
  const decision = await waitingFor<{ actionId: string }>("approval", seconds);
  const outcome = await step(`decided:${id}`, async () => {
    const current = decision
      ? await getAction(c, userId, action.id)
      : await expireAction(c, userId, action.id);
    const finished =
      current.status === "approved" ? await executeAction(c, userId, action.id) : current;
    await updateTask(
      c,
      userId,
      taskId,
      { status: "running", actionId: null },
      {
        kind: "tool",
        title: `Action ${finished.status.replace("_", " ")}`,
        detail: finished.result ?? finished.error ?? "",
      },
    );
    return finished;
  });
  return { status: outcome.status, result: outcome.result, error: outcome.error };
}

/** A tool from one of the owner's MCP connectors: read-only tools run, others ask first. */
async function runConnectorCall(userId: string, taskId: string, call: ModelCall) {
  const c = ctx();
  const id = call.toolCallId;
  const found = await step(
    `mcp-tool:${id}`,
    async () => (await connectorToolsFor(c, userId)).find((t) => t.name === call.toolName) ?? null,
  );
  if (!found) return { error: `The connector tool ${call.toolName} is no longer available` };
  if (found.policy === "ask") {
    const { kind, payload } = proposalFor(found, call.input);
    return proposeAndWait(
      userId,
      taskId,
      id,
      kind,
      payload,
      `${found.connectorName}: ${found.tool}`,
    );
  }
  return step(`mcp:${id}`, async () => {
    const result = await runAutoTool(c, userId, found, call.input);
    await addEvent(
      c,
      userId,
      taskId,
      "tool",
      "error" in result
        ? `${found.connectorName}: ${found.tool} failed`
        : `Used ${found.connectorName}: ${found.tool}`,
      "error" in result ? result.error : "",
    );
    return result;
  });
}

async function runTool(
  userId: string,
  taskId: string,
  call: ModelCall,
  plan: { current: PlanStep[]; goalId?: string | null },
): Promise<unknown> {
  const c = ctx();
  const name = call.toolName as TaskToolName;
  if (!(name in allTaskTools) && call.toolName.startsWith("mcp_"))
    return runConnectorCall(userId, taskId, call);
  const schema = allTaskTools[name]?.inputSchema as z.ZodType | undefined;
  if (!schema) return { error: `Unknown tool ${call.toolName}` };
  const parsed = schema.safeParse(call.input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.issues[0]?.message}` };
  const id = call.toolCallId;

  switch (name) {
    case "set_plan": {
      const { steps } = parsed.data as { steps: string[] };
      plan.current = steps.map((title, i) => ({
        id: String(i),
        title,
        status: i === 0 ? "active" : "pending",
      }));
      const current = plan.current;
      await step(`plan:${id}`, () =>
        updateTask(c, userId, taskId, { plan: current }, { kind: "step", title: "Made a plan" }),
      );
      return { ok: true, plan: steps };
    }
    case "complete_step": {
      const { index } = parsed.data as { index: number };
      if (!plan.current[index]) return { error: "No such step" };
      plan.current = plan.current.map((s, i) => ({
        ...s,
        status:
          i === index ? "done" : i === index + 1 && s.status === "pending" ? "active" : s.status,
      }));
      const current = plan.current;
      const title = current[index]?.title ?? "Step";
      await step(`progress:${id}`, () =>
        updateTask(c, userId, taskId, { plan: current }, { kind: "step", title: `Done: ${title}` }),
      );
      return { ok: true };
    }
    case "web_fetch": {
      const { url } = parsed.data as { url: string };
      return step(`web:${id}`, async () => {
        const page = await readWebPage(c, url);
        await addEvent(
          c,
          userId,
          taskId,
          "tool",
          "error" in page ? "Could not read a page" : `Read ${page.title || page.url}`,
          "error" in page ? page.error : page.url,
        );
        return page;
      });
    }
    case "browse":
    case "click_link":
    case "read_page": {
      const input = parsed.data as { url?: string; name?: string };
      return step(`browser:${id}`, async () => {
        const result =
          name === "browse"
            ? await browseForAgent(c, userId, { taskId }, input.url ?? "")
            : await scopedAgentAction(
                c,
                userId,
                { taskId },
                name === "click_link"
                  ? { type: "click", name: input.name ?? "" }
                  : { type: "read" },
              );
        await addEvent(
          c,
          userId,
          taskId,
          "tool",
          "error" in result ? "Browser problem" : `Browsed ${result.title || result.url}`,
          "error" in result ? result.error : result.url,
        );
        return result;
      });
    }
    case "remember_fact": {
      const { text } = parsed.data as { text: string };
      return step(`memory:${id}`, async () => {
        const memory = await addMemory(c, userId, text, "Saved during a task");
        return { ok: true, id: memory.id };
      });
    }
    case "ask_user": {
      const { question } = parsed.data as { question: string };
      await step(`ask:${id}`, async () => {
        await updateTask(
          c,
          userId,
          taskId,
          { status: "waiting_input", question },
          { kind: "status", title: "Needs your input", detail: question },
        );
        await notify(c, userId, {
          title: "Your input is needed",
          category: "needs_you",
          body: question,
          taskId,
          dedupeKey: `ask:${taskId}:${id}`,
        });
      });
      const message = await waitingFor<{ answer: string }>("input", answerTimeoutSeconds);
      if (!message) throw new AppError("No answer arrived within 30 days", 408);
      await step(`answered:${id}`, () =>
        updateTask(c, userId, taskId, { status: "running", question: null }),
      );
      return { answer: message.answer };
    }
    case "propose_webhook":
    case "propose_email":
    case "propose_event": {
      const data = parsed.data as Record<string, unknown>;
      const kind =
        name === "propose_email"
          ? "email.send"
          : name === "propose_event"
            ? "calendar.create"
            : "webhook.post";
      return proposeAndWait(
        userId,
        taskId,
        id,
        kind,
        data,
        typeof data.summary === "string" ? data.summary : undefined,
      );
    }
    case "computer_run":
    case "computer_list":
    case "computer_read_file":
    case "computer_write_file":
    case "computer_import_file":
    case "computer_export_pdf":
      // The operation id makes a replayed step return the original receipt, never rerun.
      return step(`${name}:${id}`, async () => {
        const result = await runComputerTool(c, userId, name, parsed.data, {
          operationId: `task:${taskId}:${id}`,
          taskId,
        });
        const r = (result ?? {}) as { error?: string; status?: string; exitCode?: number | null };
        await addEvent(
          c,
          userId,
          taskId,
          "tool",
          r.error
            ? `${name.replace(/_/g, " ")} failed`
            : name === "computer_run"
              ? `Ran a command (${r.status}${r.exitCode != null ? `, exit ${r.exitCode}` : ""})`
              : name.replace("computer_", "Computer: ").replace(/_/g, " "),
          r.error ??
            (name === "computer_run"
              ? String((parsed.data as { command: string }).command).slice(0, 300)
              : ""),
        );
        return result;
      });
    case "add_goal_milestones":
    case "goal_status":
    case "watch_page":
    case "finance_summary":
      return step(`${name}:${id}`, async () => {
        const result = (await runLifeTool(c, userId, name, parsed.data, {
          goalId: plan.goalId,
        })) as { error?: string } | null;
        if (name !== "goal_status")
          await addEvent(
            c,
            userId,
            taskId,
            "tool",
            result?.error
              ? `${name.replace(/_/g, " ")} failed`
              : name === "add_goal_milestones"
                ? "Added milestones to the goal"
                : name === "watch_page"
                  ? "Started watching a page"
                  : "Read the spending summary",
            result?.error ?? "",
          );
        return result;
      });
    case "search_mail":
    case "read_email_thread":
    case "list_events":
    case "import_attachment":
    case "inspect_pdf":
    case "fill_pdf": {
      const run = workspaceTools[name] as (
        ctx: Context,
        userId: string,
        input: unknown,
      ) => Promise<unknown>;
      return step(`${name}:${id}`, async () => {
        const result = await run(c, userId, parsed.data);
        const failed = result && typeof result === "object" && "error" in result;
        await addEvent(
          c,
          userId,
          taskId,
          "tool",
          failed ? `${name.replace(/_/g, " ")} failed` : workspaceEventTitle[name],
          failed ? String((result as { error: string }).error) : "",
        );
        return result;
      });
    }
    case "finish_task": {
      const { summary } = parsed.data as { summary: string };
      const done = plan.current.map((s) => ({
        ...s,
        status: s.status === "skipped" ? s.status : ("done" as const),
      }));
      await step(`finish:${id}`, async () => {
        const task = await updateTask(
          c,
          userId,
          taskId,
          { status: "succeeded", result: summary, plan: done },
          { kind: "result", title: "Finished", detail: summary },
        );
        // Goal bookkeeping never turns a finished task into a failed one.
        if (task)
          await recordGoalProgress(c, userId, taskId).catch((error) =>
            console.warn("[goals] could not record progress:", (error as Error).message),
          );
        if (task)
          await notify(c, userId, {
            title: `Done: ${task.title}`,
            category: "results",
            body: summary,
            taskId,
            dedupeKey: `done:${taskId}`,
          });
      });
      return { finished: true };
    }
  }
}

const isCancellation = (error: unknown) => error instanceof Error && /Cancelled/i.test(error.name);

async function taskWorkflowFunction(userId: string, taskId: string): Promise<void> {
  const c = ctx();
  const task = await step("load", async () => {
    const row = await getTaskRow(c, userId, taskId);
    await updateTask(
      c,
      userId,
      taskId,
      { status: "running" },
      { kind: "status", title: "Started working" },
    );
    return { prompt: row.prompt, model: row.model, plan: row.plan, goalId: row.goalId };
  });
  const plan = { current: task.plan, goalId: task.goalId };
  const messages: ModelMessage[] = [{ role: "user", content: task.prompt }];
  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const reply = await DBOS.runStep(() => nextStep(userId, task.model, messages), {
        name: `model:${turn}`,
        retriesAllowed: true,
        maxAttempts: 3,
        intervalSeconds: 2,
        shouldRetry: (error) => !(error instanceof AppError),
      });
      messages.push({
        role: "assistant",
        content: [
          ...(reply.text ? [{ type: "text" as const, text: reply.text }] : []),
          ...reply.toolCalls.map((call) => ({ type: "tool-call" as const, ...call })),
        ],
      });
      if (!reply.toolCalls.length) {
        await runTool(
          userId,
          taskId,
          {
            toolCallId: `final${turn}`,
            toolName: "finish_task",
            input: { summary: reply.text || "Finished." },
          },
          plan,
        );
        return;
      }
      for (const call of reply.toolCalls) {
        const output = await runTool(userId, taskId, call, plan);
        messages.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              output: { type: "json", value: JSON.parse(JSON.stringify(output ?? null)) },
            },
          ],
        });
        if (output && typeof output === "object" && "finished" in output) return;
      }
    }
    throw new AppError("The task used all of its steps without finishing");
  } catch (error) {
    if (isCancellation(error)) throw error;
    const message = error instanceof Error ? error.message : "The task failed";
    await step("fail", async () => {
      const failed = await updateTask(
        c,
        userId,
        taskId,
        { status: "failed", error: message, question: null },
        { kind: "error", title: "Needs attention", detail: message },
      );
      if (failed)
        await notify(c, userId, {
          title: "A task needs attention",
          category: "results",
          body: `${failed.title}: ${message}`,
          taskId,
          dedupeKey: `failed:${taskId}:${newId()}`,
        });
    });
    throw error;
  }
}

export const taskWorkflow = DBOS.registerWorkflow(taskWorkflowFunction, { name: "task" });
