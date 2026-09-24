import { activeTaskStatuses } from "@agent-v/shared";
import { tool } from "ai";
import { z } from "zod";
import { proposeAction } from "../actions.ts";
import { type BrowserScope, browseForAgent, scopedAgentAction } from "../browser/service.ts";
import type { Context } from "../context.ts";
import { createTask, listTasks } from "../tasks/service.ts";
import { readWebPage } from "../tools/web.ts";
import { workspaceDescriptions, workspaceSchemas, workspaceTools } from "../tools/workspace.ts";
import { addMemory } from "../workspace.ts";

export function chatTools(ctx: Context, userId: string, threadId: string) {
  return {
    delegate_task: tool({
      description:
        "Start a durable background task for a job that needs several steps, research, waiting or the owner's input. Returns immediately with the task id.",
      inputSchema: z.object({
        prompt: z.string().min(1).max(12_000).describe("The complete job, with all known details"),
        title: z.string().min(1).max(160).optional().describe("A short title"),
      }),
      execute: async ({ prompt, title }) => {
        const task = await createTask(ctx, userId, { prompt, title, threadId });
        return { id: task.id, title: task.title, status: task.status };
      },
    }),
    task_status: tool({
      description: "List the owner's recent tasks with their status and results.",
      inputSchema: z.object({ activeOnly: z.boolean().optional() }),
      execute: async ({ activeOnly }) => {
        const tasks = await listTasks(ctx, userId);
        return tasks
          .filter((t) => !activeOnly || activeTaskStatuses.includes(t.status))
          .slice(0, 20)
          .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            question: t.question,
            result: t.result?.slice(0, 1000) ?? null,
          }));
      },
    }),
    remember_fact: tool({
      description: "Save a preference or fact the owner explicitly asked you to remember.",
      inputSchema: z.object({ text: z.string().min(1).max(2000) }),
      execute: async ({ text }) => {
        const memory = await addMemory(ctx, userId, text, "Saved in chat");
        return { ok: true, id: memory.id };
      },
    }),
    ...(ctx.browser ? browserTools(ctx, userId, { threadId }) : webFetchTool(ctx)),
    ...mailAndCalendarTools(ctx, userId),
  };
}

/** Read mail and calendar, and propose (never perform) sends and calendar changes. */
function mailAndCalendarTools(ctx: Context, userId: string) {
  const read = (key: "search_mail" | "read_email_thread" | "list_events") =>
    tool({
      description: workspaceDescriptions[key],
      inputSchema: workspaceSchemas[key] as z.ZodType,
      execute: async (input) =>
        (workspaceTools[key] as (c: Context, u: string, i: unknown) => Promise<unknown>)(
          ctx,
          userId,
          input,
        ),
    });
  const propose = (
    key: "propose_email" | "propose_event",
    kind: "email.send" | "calendar.create",
  ) =>
    tool({
      description: `${workspaceDescriptions[key]} The owner approves it in the chat.`,
      inputSchema: workspaceSchemas[key] as z.ZodType,
      execute: async (payload) => {
        try {
          const action = await proposeAction(ctx, userId, { kind, payload });
          return { actionId: action.id, title: action.title, status: action.status };
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    });
  return {
    search_mail: read("search_mail"),
    read_email_thread: read("read_email_thread"),
    list_events: read("list_events"),
    propose_email: propose("propose_email", "email.send"),
    propose_event: propose("propose_event", "calendar.create"),
  };
}

function webFetchTool(ctx: Context) {
  return {
    web_fetch: tool({
      description:
        "Read a public web page as text. Returns url, title and up to 20,000 characters of text, or an error.",
      inputSchema: z.object({ url: z.url().max(4096) }),
      execute: async ({ url }) => readWebPage(ctx, url),
    }),
  };
}

/** The chat's own cloud browser: real Chromium that the owner can watch and take over. */
export function browserTools(ctx: Context, userId: string, scope: BrowserScope) {
  return {
    browse: tool({
      description:
        "Open a public URL in this conversation's cloud browser (real Chromium; runs JavaScript; keeps logins) and read it. Returns sessionId, url, title and up to 20,000 characters of page text, or an error. The owner can watch and take control.",
      inputSchema: z.object({ url: z.url().max(4096) }),
      execute: async ({ url }) => browseForAgent(ctx, userId, scope, url),
    }),
    click_link: tool({
      description:
        "Follow a link on the current page by its visible text, then read the new page. Only follows links; it never submits forms.",
      inputSchema: z.object({ name: z.string().min(1).max(300) }),
      execute: async ({ name }) => scopedAgentAction(ctx, userId, scope, { type: "click", name }),
    }),
    read_page: tool({
      description:
        "Read the browser's current page again, for example after the owner took control and changed it.",
      inputSchema: z.object({}),
      execute: async () => scopedAgentAction(ctx, userId, scope, { type: "read" }),
    }),
  };
}
