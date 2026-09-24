import { jsonSchema, tool } from "ai";
import { proposeAction } from "../actions.ts";
import type { Context } from "../context.ts";
import { AppError } from "../errors.ts";
import { type AgentTool, callConnectorTool, connectorToolsFor } from "../mcp/service.ts";

/** MCP input schemas are JSON Schema objects; make sure the model always gets one. */
export const toolSchema = (t: AgentTool) =>
  jsonSchema<Record<string, unknown>>({ type: "object", properties: {}, ...t.inputSchema });

/** Run a connector tool that needs no review. Failures come back as data for the model. */
export async function runAutoTool(ctx: Context, userId: string, t: AgentTool, input: unknown) {
  try {
    const result = await callConnectorTool(
      ctx,
      userId,
      t.connectorId,
      t.tool,
      (input ?? {}) as Record<string, unknown>,
    );
    return result.isError
      ? { error: result.text }
      : { result: result.text, ...(result.truncated ? { truncated: true } : {}) };
  } catch (error) {
    if (error instanceof AppError || (error as { outcomeUnknown?: boolean }).outcomeUnknown)
      return { error: (error as Error).message };
    throw error;
  }
}

export const proposalFor = (t: AgentTool, input: unknown) => ({
  kind: "mcp.call" as const,
  payload: {
    connectorId: t.connectorId,
    connector: t.connectorName,
    tool: t.tool,
    arguments: (input ?? {}) as Record<string, unknown>,
  },
});

/** Chat tools for the owner's connectors. Tools that ask first create a review card. */
export async function connectorChatTools(ctx: Context, userId: string) {
  const list = await connectorToolsFor(ctx, userId);
  return Object.fromEntries(
    list.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: toolSchema(t),
        execute: async (input) => {
          if (t.policy === "auto") return runAutoTool(ctx, userId, t, input);
          try {
            const action = await proposeAction(ctx, userId, proposalFor(t, input));
            return {
              actionId: action.id,
              title: action.title,
              status: action.status,
              note: "Waiting for the owner to approve this call in the chat.",
            };
          } catch (error) {
            return { error: (error as Error).message };
          }
        },
      }),
    ]),
  );
}
