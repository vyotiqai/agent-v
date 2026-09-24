import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const demoConnectorUrl = "demo://tools";

// The demo notebook lives in memory: it shows a tool that writes (and therefore asks first).
const notebooks = new Map<string, string[]>();

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

const units: Record<string, [string, number]> = {
  km: ["m", 1000],
  m: ["m", 1],
  mi: ["m", 1609.344],
  ft: ["m", 0.3048],
  kg: ["g", 1000],
  g: ["g", 1],
  lb: ["g", 453.59237],
  oz: ["g", 28.349523125],
  l: ["ml", 1000],
  ml: ["ml", 1],
  gal: ["ml", 3785.411784],
};

/** A small MCP server with sample tools, one per user, connected in memory. */
export function demoMcpServer(userId: string) {
  const server = new McpServer(
    { name: "Agent V sample tools", version: "1.0.0" },
    { instructions: "Sample tools for trying connectors. The weather is fictional." },
  );
  server.registerTool(
    "convert_units",
    {
      title: "Convert units",
      description:
        "Convert a value between units of length, mass or volume (km, m, mi, ft, kg, g, lb, oz, l, ml, gal).",
      inputSchema: { value: z.number(), from: z.string(), to: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ value, from, to }) => {
      const a = units[from.toLowerCase()];
      const b = units[to.toLowerCase()];
      if (!a || !b || a[0] !== b[0])
        return { ...text(`Cannot convert ${from} to ${to}.`), isError: true };
      const result = (value * a[1]) / b[1];
      return text(`${value} ${from} = ${Number(result.toPrecision(6))} ${to}`);
    },
  );
  server.registerTool(
    "weather",
    {
      title: "Weather (fictional)",
      description: "A fictional forecast for a city, for demos.",
      inputSchema: { city: z.string().min(1).max(80) },
      annotations: { readOnlyHint: true },
    },
    async ({ city }) => {
      let seed = 0;
      for (const c of city.toLowerCase()) seed = (seed * 31 + c.charCodeAt(0)) % 997;
      const kinds = ["sunny", "partly cloudy", "cloudy", "light rain", "windy"];
      return text(
        `${city}: ${kinds[seed % kinds.length]}, ${8 + (seed % 20)}°C. (Fictional demo data.)`,
      );
    },
  );
  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description: "List the notes saved in the demo notebook.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const notes = notebooks.get(userId) ?? [];
      return text(
        notes.length ? notes.map((n, i) => `${i + 1}. ${n}`).join("\n") : "No notes yet.",
      );
    },
  );
  server.registerTool(
    "save_note",
    {
      title: "Save a note",
      description: "Save a note to the demo notebook.",
      inputSchema: { text: z.string().min(1).max(500) },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ text: note }) => {
      const notes = notebooks.get(userId) ?? [];
      notes.push(note);
      notebooks.set(userId, notes.slice(-100));
      return text(`Saved note ${notes.length}: ${note}`);
    },
  );
  return server;
}
