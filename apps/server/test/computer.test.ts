import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventType } from "@ag-ui/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permissionSlipPdf } from "../src/providers/demo.ts";
import { startTestServer, type TestServer } from "./helpers.ts";

const image = process.env.COMPUTER_IMAGE ?? "agent-v-computer:local";
function dockerReady() {
  try {
    execFileSync("docker", ["image", "inspect", image], { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}
const available = dockerReady();
const deployment = `t${randomBytes(4).toString("hex")}`;

function cleanup() {
  for (const kind of ["container", "volume"] as const) {
    const ids = execFileSync("docker", [
      kind,
      "ls",
      "-q",
      ...(kind === "container" ? ["-a"] : []),
      "--filter",
      `label=agent-v.deployment=${deployment}`,
    ])
      .toString()
      .split("\n")
      .filter(Boolean);
    if (ids.length) execFileSync("docker", [kind, "rm", "-f", ...ids], { stdio: "ignore" });
  }
}

let server: TestServer;
beforeAll(async () => {
  if (!available) return;
  server = await startTestServer({
    config: {
      COMPUTER_PROVIDER: "docker",
      COMPUTER_IMAGE: image,
      DEPLOYMENT_ID: deployment,
      COMPUTER_COMMAND_TIMEOUT_SECONDS: "5",
      COMPUTER_MEMORY_MB: "256",
    },
  });
}, 120_000);
afterAll(async () => {
  if (!available) return;
  await server?.close();
  cleanup();
});

const run = (token: string, command: string, extra: Record<string, string> = {}) =>
  server.json("/api/computer/commands", { token, body: { command, ...extra } }, 201);

describe.skipIf(!available)("Linux computer (real Docker)", () => {
  it("starts a locked-down container: unprivileged, no network, read-only system", async () => {
    const { token } = await server.signUp();
    const started = await server.json("/api/computer/start", { token, body: {} });
    expect(started).toMatchObject({ available: true, state: "running", network: "disabled" });

    const id = await run(token, "id -u; id -g");
    expect(id).toMatchObject({ status: "succeeded", exitCode: 0 });
    expect(id.stdout.trim().split("\n")).toEqual(["1000", "1000"]);
    const net = await run(token, "ls /sys/class/net");
    expect(net.stdout.trim()).toBe("lo");
    const caps = await run(token, "grep -E '^(CapEff|NoNewPrivs)' /proc/self/status");
    expect(caps.stdout).toContain("CapEff:\t0000000000000000");
    expect(caps.stdout).toMatch(/NoNewPrivs:\s+1/);
    const readOnly = await run(token, "touch /usr/local/x");
    expect(readOnly.status).toBe("failed");
    expect(readOnly.stderr).toContain("Read-only file system");
    const tools = await run(token, "node -e 'console.log(1+1)' && bash --version | head -1");
    expect(tools.stdout).toContain("2");
  });

  it("keeps /workspace across stop and start, and keeps users apart", async () => {
    const a = await server.signUp();
    const b = await server.signUp();
    await run(a.token, "echo hello > notes.txt && mkdir -p projects");
    await server.json("/api/computer/stop", { token: a.token, body: {} });
    expect((await server.json("/api/computer", { token: a.token })).state).toBe("stopped");
    const again = await run(a.token, "cat /workspace/notes.txt");
    expect(again.stdout).toBe("hello\n");
    const other = await run(b.token, "ls -A /workspace");
    expect(other.stdout).toBe("");
    expect((await server.json("/api/computer", { token: b.token })).commands).toHaveLength(1);
  });

  it("enforces time limits, caps output, and runs one command at a time", async () => {
    const { token } = await server.signUp();
    const started = Date.now();
    const slow = await run(token, "sleep 30");
    expect(slow.status).toBe("timed_out");
    expect(Date.now() - started).toBeLessThan(20_000);
    const big = await run(token, "head -c 300000 /dev/zero | tr '\\0' a");
    expect(big.truncated).toBe(true);
    expect(big.stdout.length).toBeLessThanOrEqual(64 * 1024);

    const first = run(token, "sleep 2; echo done");
    await new Promise((r) => setTimeout(r, 500));
    const second = await server.call("/api/computer/commands", {
      token,
      body: { command: "echo nope" },
    });
    expect(second.status).toBe(409);
    expect((await first).stdout).toBe("done\n");
  });

  it("never runs the same operation twice", async () => {
    const { token } = await server.signUp();
    const once = await run(token, "date +%s%N >> runs.txt; cat runs.txt | wc -l", {
      operationId: "op-1",
    });
    const again = await run(token, "date +%s%N >> runs.txt; cat runs.txt | wc -l", {
      operationId: "op-1",
    });
    expect(again.id).toBe(once.id);
    expect((await run(token, "wc -l < runs.txt")).stdout.trim()).toBe("1");
  });

  it("edits files, refuses to follow links out of the workspace, and moves PDFs to Files", async () => {
    const { token, userId } = await server.signUp();
    await server.json("/api/computer/folders", { token, body: { path: "/workspace/docs" } }, 201);
    await server.json("/api/computer/file", {
      token,
      method: "PUT",
      body: { path: "/workspace/docs/a.md", text: "# Hi\n" },
    });
    expect(
      (await server.json("/api/computer/file?path=/workspace/docs/a.md", { token })).text,
    ).toBe("# Hi\n");
    const listing = await server.json("/api/computer/files?path=/workspace/docs", { token });
    expect(
      listing.entries.map((e: { name: string; kind: string }) => `${e.kind}:${e.name}`),
    ).toEqual(["file:a.md"]);

    await run(token, "ln -s /etc /workspace/etc-link");
    const outside = await server.call("/api/computer/file?path=/workspace/etc-link/passwd", {
      token,
    });
    expect(outside.status).toBe(422);
    expect(((await outside.json()) as { error: string }).error).toContain("outside /workspace");
    await server.json("/api/computer/file?path=/etc/passwd", { token }, 422);

    const form = new FormData();
    form.set("file", new File([await permissionSlipPdf()], "slip.pdf"));
    const uploaded = (await (
      await server.app.fetch(
        new Request("http://localhost:8787/api/files", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: form,
        }),
      )
    ).json()) as { id: string };
    await server.json(
      "/api/computer/import",
      { token, body: { fileId: uploaded.id, path: "/workspace/slip.pdf" } },
      201,
    );
    expect((await run(token, "head -c 5 slip.pdf")).stdout).toBe("%PDF-");
    const exported = await server.json(
      "/api/computer/export",
      { token, body: { path: "/workspace/slip.pdf" } },
      201,
    );
    expect(exported).toMatchObject({
      name: "slip.pdf",
      source: "From your Linux computer",
      pageCount: 1,
    });
    expect(userId).toBeTruthy();
  });

  it("is usable by the agent from chat and from durable tasks", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    const events = await server.run(
      token,
      thread.id,
      "Run `python3 --version || node --version` on my computer",
    );
    const start = events.find((e) => e.type === EventType.TOOL_CALL_START) as unknown as {
      toolCallName: string;
    };
    expect(start.toolCallName).toBe("computer_run");
    const text = events
      .filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((e) => (e as unknown as { delta: string }).delta)
      .join("");
    expect(text).toMatch(/exit 0/);

    const created = await server.json(
      "/api/tasks",
      { token, body: { prompt: "On my computer run `echo 6*7 | bc || echo 42` and report" } },
      201,
    );
    const detail = await server.waitForTask(token, created.id, ["succeeded"], 30_000);
    expect(detail.task.result).toContain("42");
    const status = await server.json("/api/computer", { token });
    expect(status.commands.some((c: { taskId: string | null }) => c.taskId === created.id)).toBe(
      true,
    );
  });

  it("erases the computer and its workspace", async () => {
    const { token } = await server.signUp();
    await run(token, "echo keep > keep.txt");
    const erased = await server.json("/api/computer/erase", { token, body: {} });
    expect(erased).toMatchObject({ state: "absent", commands: [] });
    expect((await run(token, "ls -A")).stdout).toBe("");
  });
});
