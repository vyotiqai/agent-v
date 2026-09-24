#!/usr/bin/env node
// Workspace file operations for Agent V. Reads one JSON request on stdin, prints one JSON
// response; errors go to stderr with exit code 1. It runs inside the user's own container
// with the user's own permissions, so confining paths to /workspace is for clarity: the
// container itself is the security boundary.
import { constants, promises as fs } from "node:fs";
import { basename, dirname, posix } from "node:path";

const ROOT = "/workspace";
const MAX_TEXT = 512 * 1024;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 2000;

function fail(message) {
  process.stderr.write(message);
  process.exit(1);
}

async function resolveInside(path, { mustExist = true } = {}) {
  if (typeof path !== "string" || !path.startsWith("/")) fail("Paths must start with /workspace");
  const normal = posix.normalize(path);
  if (normal !== ROOT && !normal.startsWith(`${ROOT}/`))
    fail("Only files under /workspace are available");
  // Resolve links in the parent folders and make sure we are still inside the workspace.
  const parent = await fs.realpath(normal === ROOT ? ROOT : dirname(normal)).catch(() => null);
  if (!parent) fail("No such folder");
  if (parent !== ROOT && !parent.startsWith(`${ROOT}/`))
    fail("That folder links outside /workspace");
  const full = normal === ROOT ? ROOT : `${parent}/${basename(normal)}`;
  if (mustExist) await fs.lstat(full).catch(() => fail("No such file or folder"));
  return full;
}

async function readRegular(path, limit) {
  const full = await resolveInside(path);
  const handle = await fs
    .open(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    .catch(() => fail("Not a regular file (or a link)"));
  try {
    const info = await handle.stat();
    if (!info.isFile()) fail("Not a regular file");
    if (info.size > limit) fail(`File is larger than ${Math.round(limit / 1024)} KB`);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function writeAtomic(path, data) {
  const full = await resolveInside(path, { mustExist: false });
  if (full === ROOT) fail("That is the workspace root");
  const existing = await fs.lstat(full).catch(() => null);
  if (existing && !existing.isFile()) fail("Cannot overwrite a folder or a link");
  const tmp = `${dirname(full)}/.${basename(full)}.agentv-tmp`;
  const handle = await fs.open(
    tmp,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, full);
}

async function main() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_BYTES * 2) fail("Request too large");
    chunks.push(chunk);
  }
  let req;
  try {
    req = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail("Invalid request");
  }
  const path = req.path ?? ROOT;
  const out = (value) => process.stdout.write(JSON.stringify(value));

  switch (req.op) {
    case "list": {
      const full = await resolveInside(path);
      const names = (await fs.readdir(full).catch(() => fail("Not a folder")))
        .sort()
        .slice(0, MAX_ENTRIES);
      const entries = [];
      for (const name of names) {
        const info = await fs.lstat(`${full}/${name}`).catch(() => null);
        if (!info) continue;
        const kind = info.isDirectory()
          ? "dir"
          : info.isFile()
            ? "file"
            : info.isSymbolicLink()
              ? "link"
              : "other";
        entries.push({ name, kind, size: info.size, modified: Math.floor(info.mtimeMs / 1000) });
      }
      return out({ path, entries });
    }
    case "read": {
      const data = await readRegular(path, MAX_TEXT);
      const text = new TextDecoder("utf-8", { fatal: true });
      try {
        return out({ path, text: text.decode(data) });
      } catch {
        return fail("This file is not UTF-8 text");
      }
    }
    case "read_bytes":
      return out({ path, base64: (await readRegular(path, MAX_BYTES)).toString("base64") });
    case "write": {
      if (typeof req.text !== "string" || Buffer.byteLength(req.text) > MAX_TEXT)
        fail("Text is missing or too large");
      await writeAtomic(path, Buffer.from(req.text));
      return out({ path, ok: true });
    }
    case "write_bytes": {
      if (typeof req.base64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(req.base64))
        fail("Invalid file data");
      const data = Buffer.from(req.base64, "base64");
      if (data.length > MAX_BYTES) fail("File is too large");
      await writeAtomic(path, data);
      return out({ path, ok: true });
    }
    case "mkdir": {
      const full = await resolveInside(path, { mustExist: false });
      await fs
        .mkdir(full, { mode: 0o755 })
        .catch((e) => fail(e.code === "EEXIST" ? "Already exists" : "Could not create the folder"));
      return out({ path, ok: true });
    }
    case "delete": {
      const full = await resolveInside(path);
      if (full === ROOT) fail("The workspace itself cannot be deleted");
      const info = await fs.lstat(full);
      if (info.isDirectory())
        await fs.rmdir(full).catch(() => fail("Folders must be empty before deleting"));
      else await fs.unlink(full);
      return out({ path, ok: true });
    }
    default:
      return fail("Unknown operation");
  }
}

await main();
