import { randomBytes } from "node:crypto";
import type { EmailDraft, MailAttachment, MailMessage } from "@agent-v/shared";
import { AppError } from "../../errors.ts";
import { htmlToText } from "../../net/safe-fetch.ts";
import type { Blob } from "../types.ts";

/** Gmail's `format=full` message resource (the parts we read). */
export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

const header = (part: GmailPart | undefined, name: string) =>
  part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function decode(data: string | undefined, charset = "utf-8") {
  if (!data) return "";
  const bytes = Buffer.from(data, "base64url");
  try {
    return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(bytes);
  } catch {
    // Unknown charsets fall back to UTF-8 instead of failing the whole message.
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function charsetOf(part: GmailPart) {
  return /charset="?([\w-]+)"?/i.exec(header(part, "Content-Type"))?.[1] ?? "utf-8";
}

function splitAddresses(value: string) {
  return value
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Walk the MIME tree: prefer text/plain, fall back to HTML converted to text; list attachments. */
export function parseGmailMessage(message: GmailMessage): MailMessage {
  let plain = "";
  let html = "";
  const attachments: MailAttachment[] = [];
  const walk = (part: GmailPart | undefined, depth: number) => {
    if (!part || depth > 30) return;
    const type = (part.mimeType ?? "").toLowerCase();
    if (part.filename && part.body?.attachmentId)
      attachments.push({
        id: part.body.attachmentId,
        name: part.filename.slice(0, 250),
        mimeType: type || "application/octet-stream",
        size: part.body.size ?? 0,
      });
    else if (type === "text/plain" && !plain) plain = decode(part.body?.data, charsetOf(part));
    else if (type === "text/html" && !html) html = decode(part.body?.data, charsetOf(part));
    for (const child of part.parts ?? []) walk(child, depth + 1);
  };
  walk(message.payload, 0);
  const payload = message.payload;
  const body = (plain || (html ? htmlToText(html).text : "")).slice(0, 100_000);
  const date = header(payload, "Date");
  return {
    id: message.id,
    threadId: message.threadId,
    from: header(payload, "From"),
    to: splitAddresses(header(payload, "To")),
    cc: splitAddresses(header(payload, "Cc")),
    subject: header(payload, "Subject"),
    date: Number.isNaN(Date.parse(date))
      ? new Date(Number(message.internalDate ?? 0)).toISOString()
      : new Date(date).toISOString(),
    snippet: message.snippet ?? body.slice(0, 160),
    body,
    labels: message.labelIds ?? [],
    attachments,
    messageIdHeader: header(payload, "Message-ID") || null,
  };
}

/** RFC 2047 encoded-word for non-ASCII header text. */
function encodeHeader(value: string) {
  if (/[\r\n]/.test(value)) throw new AppError("Header values must be a single line", 422);
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function encodeFileName(name: string) {
  const clean = name.replace(/["\\\r\n]/g, "_");
  return `filename="${clean.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

const wrap = (base64: string) => base64.replace(/.{1,76}/g, "$&\r\n");

/** Build an RFC 5322 message with CRLF line endings, attachments and reply threading. */
export function buildMime(
  draft: EmailDraft,
  from: string,
  attachments: Blob[],
  reply?: { messageId: string | null; references?: string },
) {
  for (const address of [...draft.to, ...draft.cc])
    if (/[\r\n<>,;]/.test(address)) throw new AppError("Invalid recipient address", 422);
  const headers = [
    `From: ${from}`,
    `To: ${draft.to.join(", ")}`,
    ...(draft.cc.length ? [`Cc: ${draft.cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(draft.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (reply?.messageId) {
    if (!/^<[^<>\r\n]+>$/.test(reply.messageId)) throw new AppError("Invalid reply reference", 422);
    headers.push(`In-Reply-To: ${reply.messageId}`);
    headers.push(`References: ${[reply.references, reply.messageId].filter(Boolean).join(" ")}`);
  }
  const text = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(Buffer.from(draft.body.replace(/\r?\n/g, "\r\n")).toString("base64")),
  ].join("\r\n");
  if (!attachments.length) return `${headers.join("\r\n")}\r\n${text}`;
  const boundary = `agentv_${randomBytes(12).toString("hex")}`;
  const parts = [
    text,
    ...attachments.map((a) =>
      [
        `Content-Type: ${a.mimeType}; name="${a.name.replace(/["\\\r\n]/g, "_")}"`,
        `Content-Disposition: attachment; ${encodeFileName(a.name)}`,
        "Content-Transfer-Encoding: base64",
        "",
        wrap(Buffer.from(a.bytes).toString("base64")),
      ].join("\r\n"),
    ),
  ];
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    ...parts.map((p) => `--${boundary}\r\n${p}`),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
