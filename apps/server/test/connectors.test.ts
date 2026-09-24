import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { EventType } from "@ag-ui/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { callConnectorTool } from "../src/mcp/service.ts";
import { guardedFetch } from "../src/net/safe-fetch.ts";
import { must, startTestServer, type TestServer } from "./helpers.ts";

let server: TestServer;

// A real MCP server over Streamable HTTP, protected by a bearer token or by a small OAuth 2.1
// authorization server (discovery, dynamic registration, PKCE, refresh).
let mcp: Server;
let base = "";
const oauth = {
  accessToken: "at-1",
  refreshToken: "rt-1",
  issued: 0,
  refreshed: 0,
  challenge: "",
  registered: 0,
};
let dropNextCall = false;

function remoteTools() {
  const s = new McpServer({ name: "Remote test server", version: "2.0.0" });
  s.registerTool(
    "echo",
    {
      description: "Echo text back",
      inputSchema: { text: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ text }) => ({ content: [{ type: "text", text: `echo: ${text}` }] }),
  );
  s.registerTool(
    "delete_everything",
    { description: "Deletes all records", annotations: { destructiveHint: true } },
    async () => ({ content: [{ type: "text", text: "Deleted 3 records" }] }),
  );
  return s;
}

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
};

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", base);
  if (url.pathname.startsWith("/.well-known/oauth-protected-resource"))
    return json(res, 200, { resource: `${base}/oauth/mcp`, authorization_servers: [base] });
  if (url.pathname === "/.well-known/oauth-authorization-server")
    return json(res, 200, {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  if (url.pathname === "/register") {
    oauth.registered++;
    return json(res, 201, { ...JSON.parse(await body(req)), client_id: "client-1" });
  }
  if (url.pathname === "/token") {
    const form = new URLSearchParams(await body(req));
    if (form.get("grant_type") === "authorization_code") {
      const verifier = form.get("code_verifier") ?? "";
      const computed = createHash("sha256").update(verifier).digest("base64url");
      if (form.get("code") !== "good-code" || computed !== oauth.challenge)
        return json(res, 400, { error: "invalid_grant" });
      oauth.issued++;
    } else if (form.get("grant_type") === "refresh_token") {
      if (form.get("refresh_token") !== oauth.refreshToken)
        return json(res, 400, { error: "invalid_grant" });
      oauth.refreshed++;
    } else return json(res, 400, { error: "unsupported_grant_type" });
    return json(res, 200, {
      access_token: oauth.accessToken,
      refresh_token: oauth.refreshToken,
      token_type: "Bearer",
      expires_in: 3600,
    });
  }
  const protectedBy =
    url.pathname === "/bearer/mcp"
      ? "Bearer secret-token"
      : url.pathname === "/oauth/mcp"
        ? "oauth"
        : null;
  if (!protectedBy) return json(res, 404, { error: "not found" });
  const given = req.headers.authorization ?? "";
  const ok =
    protectedBy === "oauth" ? given === `Bearer ${oauth.accessToken}` : given === protectedBy;
  if (!ok) {
    res.writeHead(401, {
      "content-type": "application/json",
      ...(protectedBy === "oauth"
        ? {
            "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/oauth/mcp"`,
          }
        : {}),
    });
    return res.end(JSON.stringify({ error: "unauthorized" }));
  }
  const raw = req.method === "POST" ? await body(req) : "";
  const parsed = raw ? JSON.parse(raw) : undefined;
  if (dropNextCall && parsed?.method === "tools/call") {
    dropNextCall = false;
    return req.socket.destroy();
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const s = remoteTools();
  res.on("close", () => {
    void transport.close();
    void s.close();
  });
  await s.connect(transport);
  await transport.handleRequest(req, res, parsed);
}

beforeAll(async () => {
  server = await startTestServer();
  mcp = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) json(res, 500, { error: String(error) });
    });
  });
  await new Promise<void>((resolve) => mcp.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(mcp.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await server?.close();
  await new Promise((resolve) => mcp?.close(resolve));
});

const toolStarts = (events: { type: string }[]) =>
  events
    .filter((e) => e.type === EventType.TOOL_CALL_START)
    .map((e) => (e as unknown as { toolCallName: string }).toolCallName);
const lastResult = (events: { type: string }[]) =>
  JSON.parse(
    (
      events.filter((e) => e.type === EventType.TOOL_CALL_RESULT).at(-1) as unknown as {
        content: string;
      }
    ).content,
  );
const reply = (events: { type: string }[]) =>
  events
    .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((e) => (e as unknown as { delta: string }).delta)
    .join("");

describe("sample connector", () => {
  it("runs read-only tools directly and asks before tools that change things", async () => {
    const { token } = await server.signUp();
    const { connector } = await server.json(
      "/api/connectors",
      { token, body: { name: "Samples", url: "demo://tools" } },
      201,
    );
    expect(connector).toMatchObject({ status: "connected", serverName: "Agent V sample tools" });
    expect(
      Object.fromEntries(
        connector.tools.map((t: { name: string; policy: string }) => [t.name, t.policy]),
      ),
    ).toEqual({
      convert_units: "auto",
      weather: "auto",
      list_notes: "auto",
      save_note: "ask",
    });

    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    let events = await server.run(token, thread.id, "Convert 5 km to mi");
    expect(toolStarts(events)).toEqual(["mcp_samples_convert_units"]);
    expect(reply(events)).toBe("5 km = 3.10686 mi");

    events = await server.run(token, thread.id, "Save a note: buy oat milk");
    expect(toolStarts(events)).toEqual(["mcp_samples_save_note"]);
    const proposed = lastResult(events);
    expect(proposed).toMatchObject({ status: "awaiting_review", title: "Samples: save_note" });
    expect(reply(await server.run(token, thread.id, "List my notes"))).toBe("No notes yet.");

    const action = await server.json(`/api/actions/${proposed.actionId}`, { token });
    expect(action.payload).toMatchObject({
      tool: "save_note",
      arguments: { text: "buy oat milk" },
    });
    const done = await server.json(`/api/actions/${action.id}/decide`, {
      token,
      body: { hash: action.hash, decision: "approve" },
    });
    expect(done).toMatchObject({ status: "succeeded", result: "Saved note 1: buy oat milk" });
    expect(reply(await server.run(token, thread.id, "List my notes"))).toBe("1. buy oat milk");

    // Turned-off tools are not offered to the agent at all.
    await server.json(`/api/connectors/${connector.id}`, {
      token,
      method: "PATCH",
      body: { policies: { weather: "off" } },
    });
    events = await server.run(token, thread.id, "What's the weather in Lisbon?");
    expect(toolStarts(events)).toEqual([]);

    // Other people cannot see or use it.
    const other = await server.signUp();
    expect(await server.json("/api/connectors", { token: other.token })).toEqual([]);
    await server.json(
      `/api/connectors/${connector.id}/refresh`,
      { token: other.token, body: {} },
      404,
    );
  });

  it("uses connector tools from durable tasks, with approval for writes", async () => {
    const { token } = await server.signUp();
    await server.json(
      "/api/connectors",
      { token, body: { name: "Samples", url: "demo://tools" } },
      201,
    );
    const task = await server.json(
      "/api/tasks",
      { token, body: { prompt: "Save a note: call the dentist" } },
      201,
    );
    const waiting = await server.waitForTask(token, task.id, ["waiting_approval"]);
    expect(waiting.action).toMatchObject({ kind: "mcp.call", title: "Samples: save_note" });
    await server.json(`/api/actions/${waiting.action.id}/decide`, {
      token,
      body: { hash: waiting.action.hash, decision: "approve" },
    });
    const done = await server.waitForTask(token, task.id, ["succeeded"]);
    expect(done.task.result).toContain("call the dentist");

    const convert = await server.json(
      "/api/tasks",
      { token, body: { prompt: "Convert 2 lb to kg and tell me" } },
      201,
    );
    const converted = await server.waitForTask(token, convert.id, ["succeeded"]);
    expect(converted.task.result).toBe("2 lb = 0.907185 kg");
    expect(converted.events.map((e: { title: string }) => e.title)).toContain(
      "Used Samples: convert_units",
    );
  });
});

describe("remote connectors", () => {
  it("connects with a bearer token and reports a lost call as an unknown outcome", async () => {
    const { token, userId } = await server.signUp();
    const { connector: wrong } = await server.json(
      "/api/connectors",
      { token, body: { name: "Remote", url: `${base}/bearer/mcp`, auth: "bearer", token: "nope" } },
      201,
    );
    expect(wrong.status).toBe("error");
    expect(wrong.error).toContain("401");
    const fixed = await server.json(`/api/connectors/${wrong.id}`, {
      token,
      method: "PATCH",
      body: { token: "secret-token" },
    });
    expect(fixed).toMatchObject({ status: "connected", serverName: "Remote test server" });
    expect(
      fixed.tools.map((t: { name: string; policy: string }) => `${t.name}:${t.policy}`),
    ).toEqual(["echo:auto", "delete_everything:ask"]);
    // The token is stored sealed, never in the clear.
    const row = must(
      await server.ctx.db.query.connectors.findFirst({ where: (c, { eq }) => eq(c.id, wrong.id) }),
    );
    expect(row.secret).not.toContain("secret-token");

    expect(await callConnectorTool(server.ctx, userId, wrong.id, "echo", { text: "hi" })).toEqual({
      text: "echo: hi",
      isError: false,
      truncated: false,
    });
    dropNextCall = true;
    await expect(
      callConnectorTool(server.ctx, userId, wrong.id, "echo", { text: "lost" }),
    ).rejects.toMatchObject({ outcomeUnknown: true });
  });

  it("signs in with OAuth 2.1: discovery, registration, PKCE, single-use state, refresh", async () => {
    const { token, userId } = await server.signUp();
    const created = await server.json(
      "/api/connectors",
      { token, body: { name: "Protected", url: `${base}/oauth/mcp`, auth: "oauth" } },
      201,
    );
    expect(created.connector.status).toBe("needs_auth");
    const authorize = new URL(created.authorizationUrl);
    expect(authorize.origin + authorize.pathname).toBe(`${base}/authorize`);
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      client_id: "client-1",
      response_type: "code",
      code_challenge_method: "S256",
      redirect_uri: "http://localhost:8787/api/connectors/oauth/callback",
      resource: `${base}/oauth/mcp`,
    });
    expect(oauth.registered).toBe(1);
    oauth.challenge = must(authorize.searchParams.get("code_challenge"));
    const state = must(authorize.searchParams.get("state"));

    const callback = await server.call(
      `/api/connectors/oauth/callback?code=good-code&state=${state}`,
    );
    expect(callback.status).toBe(200);
    expect(await callback.text()).toContain("Protected is connected");
    expect(oauth.issued).toBe(1);
    const [connector] = await server.json("/api/connectors", { token });
    expect(connector).toMatchObject({ status: "connected" });
    expect(connector.tools).toHaveLength(2);
    // The state works once.
    expect(
      (await server.call(`/api/connectors/oauth/callback?code=good-code&state=${state}`)).status,
    ).toBe(400);

    // When the access token stops working, the refresh token gets a new one.
    oauth.accessToken = "at-2";
    const result = await callConnectorTool(server.ctx, userId, connector.id, "echo", {
      text: "again",
    });
    expect(result.text).toBe("echo: again");
    expect(oauth.refreshed).toBe(1);
  });

  it("keeps connectors off private networks unless allowed", async () => {
    const guard = guardedFetch({ allowPrivate: false });
    await expect(guard.fetch(`${base}/bearer/mcp`)).rejects.toThrow(/private|not allowed|blocked/i);
    await guard.close();
    const { token } = await server.signUp();
    await server.json(
      "/api/connectors",
      { token, body: { name: "Bad", url: "file:///etc/passwd" } },
      422,
    );
  });
});
