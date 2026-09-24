import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileItem } from "@agent-v/shared";
import { and, desc, eq } from "drizzle-orm";
import { type Context, newId } from "../context.ts";
import { files } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";
import { fillPdf, inspectPdf, isPdf, maxPdfBytes } from "./pdf.ts";

type Row = typeof files.$inferSelect;
const maxFilesPerUser = 2000;

/** Files live on local disk under DATA_DIR; the path uses only server-generated ids. */
function pathOf(ctx: Context, userId: string, id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(userId) || !/^[a-f0-9-]{36}$/.test(id))
    throw new AppError("Invalid file id", 400);
  return join(ctx.config.dataDir, "files", userId, id);
}

export function safeFileName(name: string) {
  const base = name
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what we strip
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const clean = base || "document";
  return /\.pdf$/i.test(clean) ? clean : `${clean}.pdf`;
}

export function toFileItem(ctx: Context, row: Row): FileItem {
  const path = `/api/files/${row.id}/content`;
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    parentId: row.parentId,
    source: row.source,
    pageCount: row.pageCount,
    fields: row.fields,
    createdAt: row.createdAt.toISOString(),
    url: `${ctx.config.publicUrl}${path}?${ctx.signer.sign(row.userId, path, 15 * 60)}`,
  };
}

export async function storeFile(
  ctx: Context,
  userId: string,
  input: { name: string; bytes: Uint8Array; source: string; parentId?: string },
) {
  if (!isPdf(input.bytes)) throw new AppError("Only PDF files are supported for now", 415);
  if (input.bytes.length > maxPdfBytes) throw new AppError("PDFs must be 10 MB or smaller", 413);
  const count = await ctx.db.$count(files, eq(files.userId, userId));
  if (count >= maxFilesPerUser)
    throw new AppError("File limit reached. Delete some files first.", 409);
  const info = await inspectPdf(input.bytes);
  const id = newId();
  const path = pathOf(ctx, userId, id);
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(`${path}.tmp`, input.bytes, { mode: 0o600 });
  await rename(`${path}.tmp`, path);
  const [row] = await ctx.db
    .insert(files)
    .values({
      id,
      userId,
      name: safeFileName(input.name),
      mimeType: "application/pdf",
      size: input.bytes.length,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      parentId: input.parentId,
      source: input.source.slice(0, 200),
      pageCount: info.pageCount,
      fields: info.fields,
    })
    .returning();
  if (!row) throw new AppError("File could not be saved", 500);
  await ctx.realtime.publish(userId, { type: "file", id });
  return toFileItem(ctx, row);
}

export async function getFileRow(ctx: Context, userId: string, id: string) {
  const [row] = await ctx.db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.userId, userId)));
  if (!row) throw notFound("File");
  return row;
}

export async function listFiles(ctx: Context, userId: string) {
  const rows = await ctx.db
    .select()
    .from(files)
    .where(eq(files.userId, userId))
    .orderBy(desc(files.createdAt))
    .limit(500);
  return rows.map((row) => toFileItem(ctx, row));
}

export async function readFileBytes(ctx: Context, userId: string, id: string) {
  const row = await getFileRow(ctx, userId, id);
  const bytes = await readFile(pathOf(ctx, userId, row.id)).catch(() => {
    throw new AppError("The file's contents are missing", 410);
  });
  if (createHash("sha256").update(bytes).digest("hex") !== row.sha256)
    throw new AppError("The file failed its integrity check", 500);
  return { row, bytes: new Uint8Array(bytes) };
}

/** Save a filled copy of a PDF form; the original stays unchanged. */
export async function fillFile(
  ctx: Context,
  userId: string,
  id: string,
  values: Record<string, string | boolean>,
) {
  const { row, bytes } = await readFileBytes(ctx, userId, id);
  const filled = await fillPdf(bytes, values);
  return storeFile(ctx, userId, {
    name: row.name.replace(/(\s\(filled\))?\.pdf$/i, " (filled).pdf"),
    bytes: filled.bytes,
    source: "Filled by you",
    parentId: row.id,
  });
}

export async function deleteFile(ctx: Context, userId: string, id: string) {
  const row = await getFileRow(ctx, userId, id);
  await ctx.db.delete(files).where(eq(files.id, row.id));
  await rm(pathOf(ctx, userId, row.id), { force: true });
  await ctx.realtime.publish(userId, { type: "file", id });
}
