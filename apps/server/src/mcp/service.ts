import { createHash, randomBytes } from "node:crypto";
import { BlockedDestinationError, parseWebUrl } from "@agent-v/net";
import {
  type Connector,
  type ConnectorTool,
  connectorInputSchema,
  connectorUpdateSchema,
  type ToolPolicy,
} from "@agent-v/shared";
import {
  auth,
  type OAuthClientProvider,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { assertQuota } from "../billing/usage.ts";
import { type Context, iso, newId } from "../context.ts";
import { connectors, oauthStates } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";
import { guardedFetch } from "../net/safe-fetch.ts";
import { OutcomeUnknownError } from "../providers/types.ts";
import { Vault } from "../vault.ts";
import { demoConnectorUrl, demoMcpServer } from "./demo.ts";

type Row = typeof connectors.$inferSelect;
interface Secret {
  bearer?: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
}

const maxConnectors = 20;
const maxToolsPerConnector = 100;
const maxResultChars = 20_000;
const connectTimeoutMs = 15_000;
const callTimeoutMs = 60_000;

function vault(ctx: Context) {
  if (!ctx.config.encryptionKey)
    throw new AppError(
      "Set TOKEN_ENCRYPTION_KEY on the server to store connector credentials",
      503,
    );
  return new Vault(ctx.config.encryptionKey);
}
const secretContext = (row: Pick<Row, "userId" | "id">) => `connector:${row.userId}:${row.id}`;
const readSecret = (ctx: Context, row: Row): Secret =>
  row.secret ? (JSON.parse(vault(ctx).open(row.secret, secretContext(row))) as Secret) : {};

async function saveSecret(ctx: Context, row: Row, secret: Secret) {
  row.secret = vault(ctx).seal(JSON.stringify(secret), secretContext(row));
  await ctx.db.update(connectors).set({ secret: row.secret }).where(eq(connectors.id, row.id));
}

export const policyOf = (row: Pick<Row, "policies">, tool: ConnectorTool): ToolPolicy =>
  row.policies[tool.name] ?? (tool.readOnly && !tool.destructive ? "auto" : "ask");

export const toConnector = (row: Row): Connector => ({
  id: row.id,
  name: row.name,
  url: row.url,
  auth: row.auth,
  status: row.status,
  error: row.error,
  serverName: row.serverInfo?.name ?? null,
  tools: row.tools.map((t) => ({ ...t, policy: policyOf(row, t) })),
  toolsRefreshedAt: iso(row.toolsRefreshedAt),
  createdAt: row.createdAt.toISOString(),
});

export async function getConnectorRow(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(connectors)
    .where(and(eq(connectors.id, id), eq(connectors.userId, userId)));
  if (!row) throw notFound("Connector");
  return row;
}

export async function listConnectors(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(connectors)
    .where(eq(connectors.userId, userId))
    .orderBy(asc(connectors.createdAt));
  return rows;
}

/** OAuth 2.1 for MCP (discovery, dynamic registration, PKCE), with state kept in the database. */
class ConnectorOAuth implements OAuthClientProvider {
  readonly stateValue = randomBytes(24).toString("base64url");
  authorizationUrl: URL | undefined;
  private verifier: string | undefined;
  private secret: Secret;
  private readonly ctx: Context;
  private readonly row: Row;
  constructor(ctx: Context, row: Row, verifier?: string) {
    this.ctx = ctx;
    this.row = row;
    this.verifier = verifier;
    this.secret = readSecret(ctx, row);
  }
  get redirectUrl() {
    return `${this.ctx.config.publicUrl}/api/connectors/oauth/callback`;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Agent V",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  state() {
    return this.stateValue;
  }
  clientInformation() {
    return this.secret.client;
  }
  async saveClientInformation(client: OAuthClientInformationMixed) {
    this.secret = { ...this.secret, client };
    await saveSecret(this.ctx, this.row, this.secret);
  }
  tokens() {
    return this.secret.tokens;
  }
  async saveTokens(tokens: OAuthTokens) {
    this.secret = { ...this.secret, tokens };
    await saveSecret(this.ctx, this.row, this.secret);
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(verifier: string) {
    this.verifier = verifier;
  }
  codeVerifier() {
    if (!this.verifier) throw new AppError("The sign-in expired. Start again.", 409);
    return this.verifier;
  }
  get pendingVerifier() {
    return this.verifier;
  }
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "verifier" || scope === "discovery") return;
    this.secret =
      scope === "all"
        ? {}
        : scope === "client"
          ? { tokens: this.secret.tokens }
          : { client: this.secret.client };
    await saveSecret(this.ctx, this.row, this.secret);
  }
}

/** Connect to a connector's server. The caller must close the returned client. */
async function open(ctx: Context, row: Row) {
  const client = new Client({ name: "Agent V", version: "1.0.0" });
  if (row.url === demoConnectorUrl) {
    if (!ctx.config.mcpDemo) throw new AppError("The sample connector is turned off", 409);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = demoMcpServer(row.userId);
    await server.connect(serverSide);
    await client.connect(clientSide);
    return {
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }
  const guard = guardedFetch({ allowPrivate: ctx.config.allowPrivateNetworkFetch });
  const secret = row.auth === "bearer" ? readSecret(ctx, row) : {};
  const transport = new StreamableHTTPClientTransport(new URL(row.url), {
    fetch: guard.fetch,
    requestInit: secret.bearer ? { headers: { authorization: `Bearer ${secret.bearer}` } } : {},
    authProvider: row.auth === "oauth" ? new ConnectorOAuth(ctx, row) : undefined,
  });
  try {
    await client.connect(transport, { timeout: connectTimeoutMs });
  } catch (error) {
    await client.close().catch(() => {});
    await guard.close();
    throw error;
  }
  return {
    client,
    close: async () => {
      await client.close().catch(() => {});
      await guard.close();
    },
  };
}

function describeError(error: unknown) {
  if (error instanceof UnauthorizedError) return "Sign in again to use this connector";
  if (error instanceof AppError) return error.message;
  // Transport errors carry the HTTP status as `code`.
  const code = (error as { code?: unknown }).code;
  if (typeof code === "number" && code >= 400 && code < 600)
    return code === 401 || code === 403
      ? `The server refused the credentials (HTTP ${code})`
      : `The server answered HTTP ${code}`;
  const message = (error as Error).message ?? String(error);
  return message.replace(/^Streamable HTTP error: /, "").slice(0, 300);
}

async function setStatus(ctx: Context, row: Row, patch: Partial<Row>) {
  const [updated] = await ctx.db
    .update(connectors)
    .set(patch)
    .where(eq(connectors.id, row.id))
    .returning();
  await ctx.realtime.publish(row.userId, { type: "connector", id: row.id });
  return updated ?? row;
}

/** Connect, read the server's tools, and record the result (connected, needs sign-in, error). */
export async function refreshConnector(ctx: Context, userId: string, id: string) {
  const row = await getConnectorRow(ctx, userId, id);
  let session: Awaited<ReturnType<typeof open>> | undefined;
  try {
    session = await open(ctx, row);
    const tools: ConnectorTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5 && tools.length < maxToolsPerConnector; page++) {
      const result = await session.client.listTools(cursor ? { cursor } : {}, {
        timeout: connectTimeoutMs,
      });
      for (const t of result.tools)
        tools.push({
          name: t.name.slice(0, 128),
          title: t.title ?? t.annotations?.title ?? null,
          description: (t.description ?? "").slice(0, 2000),
          inputSchema: t.inputSchema as Record<string, unknown>,
          readOnly: t.annotations?.readOnlyHint === true,
          destructive: t.annotations?.destructiveHint === true,
        });
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    const info = session.client.getServerVersion();
    return toConnector(
      await setStatus(ctx, row, {
        status: "connected",
        error: null,
        transport: row.url === demoConnectorUrl ? null : "http",
        tools: tools.slice(0, maxToolsPerConnector),
        serverInfo: info
          ? {
              name: info.name,
              version: info.version,
              instructions: session.client.getInstructions()?.slice(0, 2000),
            }
          : null,
        toolsRefreshedAt: new Date(),
      }),
    );
  } catch (error) {
    return toConnector(
      await setStatus(ctx, row, {
        status: error instanceof UnauthorizedError ? "needs_auth" : "error",
        error: describeError(error),
      }),
    );
  } finally {
    await session?.close();
  }
}

function checkUrl(ctx: Context, raw: string) {
  if (raw === demoConnectorUrl) {
    if (!ctx.config.mcpDemo) throw new AppError("The sample connector is turned off", 422);
    return raw;
  }
  try {
    const url = parseWebUrl(raw);
    if (url.protocol !== "https:" && !ctx.config.allowPrivateNetworkFetch)
      throw new AppError("Connectors must use https", 422);
    return url.toString();
  } catch (error) {
    if (error instanceof BlockedDestinationError) throw new AppError(error.message, 422);
    throw error;
  }
}

export async function createConnector(ctx: Context, userId: string, raw: unknown) {
  const input = connectorInputSchema.parse(raw);
  const url = checkUrl(ctx, input.url);
  if (input.auth === "bearer" && !input.token) throw new AppError("Enter the access token", 422);
  await assertQuota(ctx, userId, "connectors", 1);
  const count = await ctx.db.$count(connectors, eq(connectors.userId, userId));
  if (count >= maxConnectors) throw new AppError(`Add at most ${maxConnectors} connectors`, 429);
  const id = newId();
  const [row] = await ctx.db
    .insert(connectors)
    .values({
      id,
      userId,
      name: input.name,
      url,
      auth: url === demoConnectorUrl ? "none" : input.auth,
      secret:
        input.auth === "bearer" && input.token
          ? vault(ctx).seal(JSON.stringify({ bearer: input.token }), `connector:${userId}:${id}`)
          : null,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new AppError(`You already have a connector named “${input.name}”`, 409);
  if (row.auth === "oauth") return startConnectorAuth(ctx, userId, row.id);
  return { connector: await refreshConnector(ctx, userId, row.id), authorizationUrl: null };
}

export async function updateConnector(ctx: Context, userId: string, id: string, raw: unknown) {
  const input = connectorUpdateSchema.parse(raw);
  const row = await getConnectorRow(ctx, userId, id);
  const patch: Partial<Row> = {};
  if (input.name) patch.name = input.name;
  if (input.policies) patch.policies = { ...row.policies, ...input.policies };
  if (input.token) {
    if (row.auth !== "bearer") throw new AppError("This connector does not use a token", 422);
    patch.secret = vault(ctx).seal(JSON.stringify({ bearer: input.token }), secretContext(row));
  }
  try {
    await setStatus(ctx, row, patch);
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new AppError(`You already have a connector named “${input.name}”`, 409);
    throw error;
  }
  return input.token
    ? refreshConnector(ctx, userId, id)
    : toConnector(await getConnectorRow(ctx, userId, id));
}

export async function deleteConnector(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .delete(connectors)
    .where(and(eq(connectors.id, id), eq(connectors.userId, userId)))
    .returning({ id: connectors.id });
  if (!row) throw notFound("Connector");
  await ctx.realtime.publish(userId, { type: "connector", id });
}

/** Begin (or refresh) OAuth sign-in. Returns the URL to open, or null when already signed in. */
export async function startConnectorAuth(ctx: Context, userId: string, id: string) {
  const row = await getConnectorRow(ctx, userId, id);
  if (row.auth !== "oauth") throw new AppError("This connector does not use sign-in", 422);
  const provider = new ConnectorOAuth(ctx, row);
  const guard = guardedFetch({ allowPrivate: ctx.config.allowPrivateNetworkFetch });
  try {
    const result = await auth(provider, { serverUrl: row.url, fetchFn: guard.fetch });
    if (result === "AUTHORIZED")
      return { connector: await refreshConnector(ctx, userId, id), authorizationUrl: null };
    if (!provider.authorizationUrl || !provider.pendingVerifier)
      throw new AppError("The server did not start a sign-in", 502);
    await ctx.db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
    await ctx.db.insert(oauthStates).values({
      state: provider.stateValue,
      userId,
      provider: `mcp:${id}`,
      verifier: provider.pendingVerifier,
      capability: "read",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const updated = await setStatus(ctx, row, { status: "needs_auth", error: null });
    return {
      connector: toConnector(updated),
      authorizationUrl: provider.authorizationUrl.toString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const updated = await setStatus(ctx, row, { status: "error", error: describeError(error) });
    return { connector: toConnector(updated), authorizationUrl: null };
  } finally {
    await guard.close();
  }
}

/** The OAuth redirect: single-use state, bound to the user and connector that started it. */
export async function completeConnectorAuth(ctx: Context, state: string, code: string) {
  const [pending] = await ctx.db
    .delete(oauthStates)
    .where(and(eq(oauthStates.state, state), gt(oauthStates.expiresAt, new Date())))
    .returning();
  if (!pending?.provider.startsWith("mcp:")) throw new AppError("This sign-in link expired", 400);
  const row = await getConnectorRow(ctx, pending.userId, pending.provider.slice(4));
  const provider = new ConnectorOAuth(ctx, row, pending.verifier);
  const guard = guardedFetch({ allowPrivate: ctx.config.allowPrivateNetworkFetch });
  try {
    await auth(provider, { serverUrl: row.url, authorizationCode: code, fetchFn: guard.fetch });
  } catch (error) {
    await setStatus(ctx, row, { status: "needs_auth", error: describeError(error) });
    throw new AppError(`Sign-in failed: ${describeError(error)}`, 400);
  } finally {
    await guard.close();
  }
  return refreshConnector(ctx, pending.userId, row.id);
}

export interface ToolResult {
  text: string;
  isError: boolean;
  truncated: boolean;
}

function flatten(result: Awaited<ReturnType<Client["callTool"]>>): ToolResult {
  const parts: string[] = [];
  for (const item of (result.content ?? []) as Record<string, unknown>[]) {
    if (item.type === "text") parts.push(String(item.text));
    else if (item.type === "image" || item.type === "audio") parts.push(`[${item.type} omitted]`);
    else if (item.type === "resource_link") parts.push(`[link: ${String(item.uri)}]`);
    else if (item.type === "resource") {
      const resource = item.resource as { text?: string; uri?: string };
      parts.push(resource.text ?? `[resource: ${resource.uri}]`);
    }
  }
  if (!parts.length && result.structuredContent)
    parts.push(JSON.stringify(result.structuredContent));
  const text = parts.join("\n").trim() || "(no output)";
  return {
    text: text.slice(0, maxResultChars),
    isError: result.isError === true,
    truncated: text.length > maxResultChars,
  };
}

/**
 * Call one tool. Failing to connect means nothing ran. Once the request is sent, only an answer
 * from the server settles it; a lost connection is reported as an unknown outcome.
 */
export async function callConnectorTool(
  ctx: Context,
  userId: string,
  connectorId: string,
  tool: string,
  args: Record<string, unknown>,
) {
  const row = await getConnectorRow(ctx, userId, connectorId);
  const known = row.tools.find((t) => t.name === tool);
  if (!known) throw new AppError(`${row.name} has no tool named ${tool}`, 404);
  if (policyOf(row, known) === "off")
    throw new AppError(`${tool} is turned off for ${row.name}`, 409);
  let session: Awaited<ReturnType<typeof open>>;
  try {
    session = await open(ctx, row);
  } catch (error) {
    if (error instanceof UnauthorizedError)
      await setStatus(ctx, row, { status: "needs_auth", error: describeError(error) });
    throw new AppError(`Could not reach ${row.name}: ${describeError(error)}`, 502);
  }
  try {
    return flatten(
      await session.client.callTool({ name: tool, arguments: args }, undefined, {
        timeout: callTimeoutMs,
      }),
    );
  } catch (error) {
    if (error instanceof McpError) return { text: error.message, isError: true, truncated: false };
    throw new OutcomeUnknownError(
      `The connection to ${row.name} was lost during ${tool}: ${describeError(error)}`,
    );
  } finally {
    await session.close();
  }
}

/** Stable tool names the model sees: mcp_<connector>_<tool>, at most 64 characters. */
export function agentToolName(connector: Pick<Row, "id" | "name">, tool: string) {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const name = `mcp_${clean(connector.name).slice(0, 20) || "server"}_${clean(tool)}`;
  if (name.length <= 64) return name;
  const hash = createHash("sha256").update(`${connector.id}:${tool}`).digest("hex").slice(0, 8);
  return `${name.slice(0, 55)}_${hash}`;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  connectorId: string;
  connectorName: string;
  tool: string;
  policy: Exclude<ToolPolicy, "off">;
}

/** Tools from the owner's connected servers that the agent may use. */
export async function connectorToolsFor(ctx: Context, userId: string): Promise<AgentTool[]> {
  const rows = await ctx.db
    .select()
    .from(connectors)
    .where(and(eq(connectors.userId, userId), eq(connectors.status, "connected")));
  const tools: AgentTool[] = [];
  const seen = new Set<string>();
  for (const row of rows)
    for (const tool of row.tools) {
      const policy = policyOf(row, tool);
      const name = agentToolName(row, tool.name);
      if (policy === "off" || seen.has(name) || tools.length >= 128) continue;
      seen.add(name);
      tools.push({
        name,
        description:
          `[${row.name}] ${tool.title ? `${tool.title}: ` : ""}${tool.description}`.slice(0, 1024) +
          (policy === "ask" ? " (The owner approves each call before it runs.)" : ""),
        inputSchema:
          tool.inputSchema && typeof tool.inputSchema === "object"
            ? tool.inputSchema
            : { type: "object", properties: {} },
        connectorId: row.id,
        connectorName: row.name,
        tool: tool.name,
        policy,
      });
    }
  return tools;
}
