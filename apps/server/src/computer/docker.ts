import { spawn } from "node:child_process";

export interface DockerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

export type DockerRunner = (
  args: string[],
  options?: { timeoutMs?: number; input?: string; maxOutputBytes?: number; signal?: AbortSignal },
) => Promise<DockerResult>;

/**
 * Run the Docker CLI. The only host program this module ever starts is `docker`, with an
 * argument list (never a shell), so user text is always a single argument or stdin.
 */
export const runDocker: DockerRunner = (args, options = {}) =>
  new Promise((resolve) => {
    const limit = options.maxOutputBytes ?? 256 * 1024;
    const env: Record<string, string> = {};
    for (const key of [
      "PATH",
      "HOME",
      "DOCKER_HOST",
      "DOCKER_CONTEXT",
      "DOCKER_CONFIG",
      "DOCKER_TLS_VERIFY",
      "DOCKER_CERT_PATH",
    ])
      if (process.env[key]) env[key] = process.env[key] as string;
    const child = spawn("docker", args, { shell: false, stdio: ["pipe", "pipe", "pipe"], env });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let timedOut = false;
    const capture = (target: Buffer[]) => (chunk: Buffer) => {
      const room = limit - size;
      if (room <= 0) {
        truncated = true;
        return;
      }
      if (chunk.length > room) truncated = true;
      target.push(chunk.subarray(0, room));
      size += Math.min(room, chunk.length);
    };
    child.stdout.on("data", capture(out));
    child.stderr.on("data", capture(err));
    const kill = () => {
      if (child.exitCode === null) child.kill("SIGKILL");
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          kill();
        }, options.timeoutMs)
      : undefined;
    options.signal?.addEventListener("abort", kill, { once: true });
    child.on("error", () => {
      err.push(Buffer.from("Docker is not available"));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", kill);
      resolve({
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        exitCode: code,
        timedOut,
        truncated,
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
