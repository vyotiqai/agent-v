import { activeTaskStatuses } from "@agent-v/shared";
import { tool } from "ai";
import { z } from "zod";
import type { Context } from "../context.ts";
import { createTask, listTasks } from "../tasks/service.ts";
import { readWebPage } from "../tools/web.ts";
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
    web_fetch: tool({
      description:
        "Read a public web page as text. Returns url, title and up to 20,000 characters of text, or an error.",
      inputSchema: z.object({ url: z.url().max(4096) }),
      execute: async ({ url }) => readWebPage(ctx, url),
    }),
  };
}
