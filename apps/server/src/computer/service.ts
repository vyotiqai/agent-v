import { createHash } from "node:crypto";
import type {
  ComputerCommand,
  ComputerEntry,
  ComputerState,
  ComputerStatus,
} from "@agent-v/shared";
import { and, desc, eq } from "drizzle-orm";
import { type Context, newId } from "../context.ts";
import { computerCommands } from "../db/schema.ts";
import { AppError } from "../errors.ts";
import { readFileBytes, storeFile } from "../files/service.ts";
import { type DockerRunner, runDocker } from "./docker.ts";

type Row = typeof computerCommands.$inferSelect;
const outputLimit = 64 * 1024;

let docker: DockerRunner = runDocker;
/** Tests replace the Docker CLI with a fake. */
export function setDockerRunner(runner: DockerRunner) {
  docker = runner;
}

function settings(ctx: Context) {
  if (!ctx.config.computer)
    throw new AppError("The Linux computer is not enabled on this server", 503);
  return ctx.config.computer;
}

/** Container and volume names never contain user input, only a hash of the user id. */
export function namesFor(ctx: Context, userId: string) {
  const { deploymentId } = settings(ctx);
  const owner = createHash("sha256").update(`${deploymentId}:${userId}`).digest("hex").slice(0, 20);
  return {
    container: `agentv-${deploymentId}-${owner}`,
    volume: `agentv-${deploymentId}-${owner}-workspace`,
    owner,
  };
}

const toCommand = (row: Row): ComputerCommand => ({
  id: row.id,
  command: row.command,
  cwd: row.cwd,
  status: row.status,
  exitCode: row.exitCode,
  stdout: row.stdout,
  stderr: row.stderr,
  truncated: row.truncated,
  taskId: row.taskId,
  startedAt: row.startedAt.toISOString(),
  finishedAt: row.finishedAt?.toISOString() ?? null,
});

interface Inspect {
  State?: { Running?: boolean };
  HostConfig?: {
    NetworkMode?: string;
    ReadonlyRootfs?: boolean;
    CapDrop?: string[] | null;
    SecurityOpt?: string[] | null;
    Privileged?: boolean;
    Init?: boolean;
  };
  Config?: { User?: string; Image?: string; Labels?: Record<string, string> };
}

async function inspect(ctx: Context, userId: string): Promise<Inspect | null> {
  const { container } = namesFor(ctx, userId);
  const result = await docker(["container", "inspect", container], { timeoutMs: 15_000 });
  if (result.exitCode !== 0) {
    if (/no such (object|container)/i.test(result.stderr)) return null;
    throw new AppError("Docker is not responding", 503);
  }
  return (JSON.parse(result.stdout) as Inspect[])[0] ?? null;
}

/** Refuse to use a container that is not locked down exactly as this server creates them. */
function assertHardened(ctx: Context, userId: string, info: Inspect) {
  const { owner } = namesFor(ctx, userId);
  const h = info.HostConfig ?? {};
  const ok =
    h.NetworkMode === "none" &&
    h.ReadonlyRootfs === true &&
    (h.CapDrop ?? []).map((c) => c.toUpperCase()).includes("ALL") &&
    (h.SecurityOpt ?? []).some((o) => o.startsWith("no-new-privileges")) &&
    h.Privileged !== true &&
    info.Config?.User === "1000:1000" &&
    info.Config?.Labels?.["agent-v.owner"] === owner;
  if (!ok)
    throw new AppError(
      "This computer's container is not configured safely. Erase it to start over.",
      409,
    );
}

export async function computerState(ctx: Context, userId: string): Promise<ComputerState> {
  if (!ctx.config.computer) return "unavailable";
  const info = await inspect(ctx, userId);
  return !info ? "absent" : info.State?.Running ? "running" : "stopped";
}

export async function computerStatus(ctx: Context, userId: string): Promise<ComputerStatus> {
  const rows = await ctx.db
    .select()
    .from(computerCommands)
    .where(eq(computerCommands.userId, userId))
    .orderBy(desc(computerCommands.startedAt))
    .limit(30);
  const c = ctx.config.computer;
  return {
    available: Boolean(c),
    state: c ? await computerState(ctx, userId).catch(() => "unavailable" as const) : "unavailable",
    network: "disabled",
    limits: c
      ? { memoryMb: c.memoryMb, cpus: c.cpus, commandTimeoutSeconds: c.commandTimeoutSeconds }
      : null,
    commands: rows.map(toCommand),
  };
}

/** Create or start the user's container: no network, read-only system, no privileges. */
export async function startComputer(ctx: Context, userId: string) {
  const c = settings(ctx);
  const { container, volume, owner } = namesFor(ctx, userId);
  const existing = await inspect(ctx, userId);
  if (existing) {
    assertHardened(ctx, userId, existing);
    if (!existing.State?.Running) {
      const started = await docker(["container", "start", container], { timeoutMs: 30_000 });
      if (started.exitCode !== 0) throw new AppError("The computer could not start", 503);
    }
  } else {
    const labels = [
      "--label",
      `agent-v.owner=${owner}`,
      "--label",
      `agent-v.deployment=${c.deploymentId}`,
    ];
    await docker(["volume", "create", ...labels, volume], { timeoutMs: 30_000 });
    const created = await docker(
      [
        "run",
        "--detach",
        "--name",
        container,
        ...labels,
        "--init",
        "--user",
        "1000:1000",
        "--workdir",
        "/workspace",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--ipc",
        "private",
        "--memory",
        `${c.memoryMb}m`,
        "--memory-swap",
        `${c.memoryMb}m`,
        "--cpus",
        String(c.cpus),
        "--pids-limit",
        String(c.pids),
        "--restart",
        "no",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=268435456,mode=1777",
        "--mount",
        `type=volume,source=${volume},target=/workspace`,
        ...(c.runtime ? ["--runtime", c.runtime] : []),
        "--pull",
        "never",
        c.image,
      ],
      { timeoutMs: 60_000 },
    );
    if (created.exitCode !== 0)
      throw new AppError(
        /No such image|not found/i.test(created.stderr)
          ? `The computer image ${c.image} is missing. Build it with: docker build -t ${c.image} apps/computer`
          : "The computer could not be created",
        503,
      );
  }
  await ctx.realtime.publish(userId, { type: "computer", id: "state" });
  return computerStatus(ctx, userId);
}

export async function stopComputer(ctx: Context, userId: string) {
  const { container } = namesFor(ctx, userId);
  if (await inspect(ctx, userId))
    await docker(["container", "stop", "--time", "5", container], { timeoutMs: 30_000 });
  await ctx.realtime.publish(userId, { type: "computer", id: "state" });
  return computerStatus(ctx, userId);
}

/** Delete the container and its workspace volume. Everything on the computer is lost. */
export async function eraseComputer(ctx: Context, userId: string) {
  const { container, volume } = namesFor(ctx, userId);
  await docker(["container", "rm", "--force", container], { timeoutMs: 30_000 });
  await docker(["volume", "rm", "--force", volume], { timeoutMs: 30_000 });
  await ctx.db.delete(computerCommands).where(eq(computerCommands.userId, userId));
  await ctx.realtime.publish(userId, { type: "computer", id: "state" });
  return computerStatus(ctx, userId);
}

async function running(ctx: Context, userId: string) {
  const info = await inspect(ctx, userId);
  if (!info?.State?.Running) await startComputer(ctx, userId);
  else assertHardened(ctx, userId, info);
  return namesFor(ctx, userId).container;
}

const active = new Map<string, AbortController>();

/**
 * Run one shell command in the user's computer and keep a receipt. Repeating an operation id
 * returns its receipt; a receipt left "running" by a crash becomes "interrupted" and is never
 * run again automatically.
 */
export async function runCommand(
  ctx: Context,
  userId: string,
  input: { command: string; cwd: string; operationId?: string; taskId?: string },
): Promise<ComputerCommand> {
  const c = settings(ctx);
  const operationId = input.operationId ?? newId();
  const [existing] = await ctx.db
    .select()
    .from(computerCommands)
    .where(and(eq(computerCommands.userId, userId), eq(computerCommands.operationId, operationId)));
  if (existing) {
    if (existing.status === "running" && !active.has(existing.id)) return interrupt(ctx, existing);
    return toCommand(existing);
  }
  let row: Row | undefined;
  try {
    [row] = await ctx.db
      .insert(computerCommands)
      .values({
        id: newId(),
        userId,
        operationId,
        taskId: input.taskId,
        command: input.command,
        cwd: input.cwd,
        status: "running",
      })
      .returning();
  } catch (error) {
    if (/computer_commands_running_idx/.test(String((error as { cause?: unknown }).cause ?? error)))
      throw new AppError("Another command is still running on this computer", 409);
    throw error;
  }
  if (!row) throw new AppError("Command could not be recorded", 500);
  await ctx.realtime.publish(userId, { type: "computer", id: row.id });

  const controller = new AbortController();
  active.set(row.id, controller);
  let patch: Partial<Row>;
  try {
    const container = await running(ctx, userId);
    const seconds = c.commandTimeoutSeconds;
    const result = await docker(
      [
        "exec",
        "--user",
        "1000:1000",
        "--workdir",
        input.cwd,
        container,
        "timeout",
        "--kill-after=3s",
        `${seconds}s`,
        "bash",
        "--noprofile",
        "--norc",
        "-c",
        input.command,
      ],
      {
        timeoutMs: (seconds + 10) * 1000,
        maxOutputBytes: outputLimit * 2,
        signal: controller.signal,
      },
    );
    const timedOut = result.timedOut || result.exitCode === 124 || result.exitCode === 137;
    patch = {
      status: controller.signal.aborted
        ? "interrupted"
        : timedOut
          ? "timed_out"
          : result.exitCode === 0
            ? "succeeded"
            : "failed",
      exitCode: result.exitCode,
      stdout: result.stdout.slice(0, outputLimit),
      stderr: result.stderr.slice(0, outputLimit),
      truncated:
        result.truncated ||
        result.stdout.length > outputLimit ||
        result.stderr.length > outputLimit,
    };
  } catch (error) {
    patch = { status: "failed", stderr: (error as Error).message };
  } finally {
    active.delete(row.id);
  }
  const [done] = await ctx.db
    .update(computerCommands)
    .set({ ...patch, finishedAt: new Date() })
    .where(eq(computerCommands.id, row.id))
    .returning();
  await ctx.realtime.publish(userId, { type: "computer", id: row.id });
  return toCommand(done ?? row);
}

async function interrupt(ctx: Context, row: Row) {
  const [updated] = await ctx.db
    .update(computerCommands)
    .set({
      status: "interrupted",
      finishedAt: new Date(),
      stderr: `${row.stderr}\n[Interrupted before it finished; it was not run again.]`.trim(),
    })
    .where(and(eq(computerCommands.id, row.id), eq(computerCommands.status, "running")))
    .returning();
  return toCommand(updated ?? row);
}

/** Stop the command running now (if any) by killing its process tree via the container. */
export async function cancelCommand(ctx: Context, userId: string) {
  const [current] = await ctx.db
    .select()
    .from(computerCommands)
    .where(and(eq(computerCommands.userId, userId), eq(computerCommands.status, "running")));
  if (!current) return null;
  const controller = active.get(current.id);
  if (controller) {
    controller.abort();
    // docker exec does not forward the kill; restarting the container ends every process.
    await docker(["container", "restart", "--time", "1", namesFor(ctx, userId).container], {
      timeoutMs: 30_000,
    });
  } else await interrupt(ctx, current);
  return current.id;
}

/** At startup, receipts still "running" belonged to a process that is gone. */
export async function recoverCommands(ctx: Context) {
  await ctx.db
    .update(computerCommands)
    .set({ status: "interrupted", finishedAt: new Date() })
    .where(eq(computerCommands.status, "running"));
}

async function files<T>(
  ctx: Context,
  userId: string,
  request: Record<string, unknown>,
): Promise<T> {
  const container = await running(ctx, userId);
  const result = await docker(
    [
      "exec",
      "--interactive",
      "--user",
      "1000:1000",
      container,
      "node",
      "/usr/local/bin/agentv-files",
    ],
    { timeoutMs: 60_000, input: JSON.stringify(request), maxOutputBytes: 16 * 1024 * 1024 },
  );
  if (result.exitCode !== 0)
    throw new AppError(result.stderr.slice(0, 300) || "File operation failed", 422);
  return JSON.parse(result.stdout) as T;
}

export const computerFiles = {
  list: (ctx: Context, userId: string, path: string) =>
    files<{ path: string; entries: ComputerEntry[] }>(ctx, userId, { op: "list", path }),
  read: (ctx: Context, userId: string, path: string) =>
    files<{ path: string; text: string }>(ctx, userId, { op: "read", path }),
  write: async (ctx: Context, userId: string, path: string, text: string) => {
    const result = await files<{ ok: boolean }>(ctx, userId, { op: "write", path, text });
    await ctx.realtime.publish(userId, { type: "computer", id: "files" });
    return result;
  },
  mkdir: (ctx: Context, userId: string, path: string) => files(ctx, userId, { op: "mkdir", path }),
  remove: async (ctx: Context, userId: string, path: string) => {
    const result = await files(ctx, userId, { op: "delete", path });
    await ctx.realtime.publish(userId, { type: "computer", id: "files" });
    return result;
  },
  /** Copy a PDF from Files into the workspace. */
  async importFile(ctx: Context, userId: string, fileId: string, path: string) {
    const { bytes } = await readFileBytes(ctx, userId, fileId);
    await files(ctx, userId, {
      op: "write_bytes",
      path,
      base64: Buffer.from(bytes).toString("base64"),
    });
    await ctx.realtime.publish(userId, { type: "computer", id: "files" });
    return { path };
  },
  /** Copy a PDF from the workspace into Files. */
  async exportFile(ctx: Context, userId: string, path: string) {
    const { base64 } = await files<{ base64: string }>(ctx, userId, { op: "read_bytes", path });
    return storeFile(ctx, userId, {
      name: path.split("/").pop() ?? "document.pdf",
      bytes: new Uint8Array(Buffer.from(base64, "base64")),
      source: "From your Linux computer",
    });
  },
};
