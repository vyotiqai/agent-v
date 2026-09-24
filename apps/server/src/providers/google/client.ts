import type { CalendarEvent, EmailDraft, EventDraft, MailMessage } from "@agent-v/shared";
import type { Context } from "../../context.ts";
import type { connections } from "../../db/schema.ts";
import { AppError } from "../../errors.ts";
import { type Blob, OutcomeUnknownError, summarize, type WorkspaceProvider } from "../types.ts";
import { buildMime, type GmailMessage, parseGmailMessage } from "./mime.ts";
import { accessToken, canWrite } from "./oauth.ts";

type Row = typeof connections.$inferSelect;
const maxJson = 25 * 1024 * 1024;

interface GoogleEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  recurringEventId?: string;
}

export function googleProvider(ctx: Context, row: Row): WorkspaceProvider {
  const api = ctx.config.google?.apiBase ?? "https://www.googleapis.com";

  /** One Google API call. Retries once with a refreshed token; writes that fail uncertainly are reported as such. */
  async function call<T>(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      write?: boolean;
    } = {},
    retry = true,
  ): Promise<T> {
    const token = await accessToken(ctx, row, !retry);
    let response: Response;
    try {
      response = await fetch(`${api}${path}`, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...init.headers,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      if (init.write)
        throw new OutcomeUnknownError(
          "Google did not answer; the change may or may not have happened",
        );
      throw new AppError("Google could not be reached", 502);
    }
    if (response.status === 401 && retry) return call<T>(path, init, false);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maxJson) throw new AppError("Google returned too much data", 502);
    const text = await response.text();
    if (!response.ok) {
      if (init.write && (response.status >= 500 || response.status === 408))
        throw new OutcomeUnknownError(
          `Google failed (${response.status}); the change may or may not have happened`,
        );
      const message = (() => {
        try {
          return (JSON.parse(text) as { error?: { message?: string } }).error?.message;
        } catch {
          return undefined;
        }
      })();
      if (response.status === 412)
        throw new AppError("The event changed since you reviewed it", 409);
      if (response.status === 403)
        throw new AppError(message ?? "Google refused this request", 403);
      if (response.status === 404) throw new AppError("Not found in Google", 404);
      throw new AppError(message ?? `Google request failed (${response.status})`, 502);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  const getMessage = (id: string) =>
    call<GmailMessage>(`/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`).then(
      parseGmailMessage,
    );

  const toEvent = (calendarId: string, e: GoogleEvent): CalendarEvent => ({
    id: e.id,
    calendarId,
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    allDay: Boolean(e.start?.date),
    location: e.location ?? "",
    description: (e.description ?? "").slice(0, 8000),
    etag: e.etag ?? null,
  });

  return {
    source: "google",
    account: row.account,
    canWrite: canWrite(row.scopes),
    async searchMail(query, limit = 20) {
      const list = await call<{ messages?: { id: string }[] }>(
        `/gmail/v1/users/me/messages?${new URLSearchParams({ q: query, maxResults: String(Math.min(limit, 25)) })}`,
      );
      // One unreadable message must not fail the whole list.
      const settled = await Promise.allSettled((list.messages ?? []).map((m) => getMessage(m.id)));
      return settled.flatMap((r) => (r.status === "fulfilled" ? [summarize(r.value)] : []));
    },
    async getThread(threadId) {
      const thread = await call<{ messages?: GmailMessage[] }>(
        `/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
      );
      return (thread.messages ?? []).slice(-50).map(parseGmailMessage);
    },
    async getAttachment(messageId, attachmentId): Promise<Blob> {
      const message = await getMessage(messageId);
      const meta = message.attachments.find((a) => a.id === attachmentId);
      if (!meta) throw new AppError("Attachment not found", 404);
      const data = await call<{ data?: string }>(
        `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      );
      return {
        name: meta.name,
        mimeType: meta.mimeType,
        bytes: Buffer.from(data.data ?? "", "base64url"),
      };
    },
    async sendMail(draft: EmailDraft, attachments: Blob[]) {
      let reply: { messageId: string | null } | undefined;
      if (draft.replyTo) {
        const original: MailMessage = await getMessage(draft.replyTo.messageId);
        if (original.threadId !== draft.replyTo.threadId)
          throw new AppError("The reply does not match its thread", 422);
        reply = { messageId: original.messageIdHeader };
      }
      const raw = buildMime(draft, row.account, attachments, reply);
      const sent = await call<{ id?: string }>("/gmail/v1/users/me/messages/send", {
        body: { raw: Buffer.from(raw).toString("base64url"), threadId: draft.replyTo?.threadId },
        write: true,
      });
      return `Sent to ${draft.to.join(", ")} from ${row.account}${sent.id ? ` (message ${sent.id})` : ""}`;
    },
    async listEvents({ from, to }) {
      const data = await call<{ items?: GoogleEvent[] }>(
        `/calendar/v3/calendars/primary/events?${new URLSearchParams({
          timeMin: from,
          timeMax: to,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "100",
        })}`,
      );
      return (data.items ?? [])
        .filter((e) => e.status !== "cancelled")
        .map((e) => toEvent("primary", e));
    },
    async createEvent(draft: EventDraft) {
      const time = (value: string) => (draft.allDay ? { date: value } : { dateTime: value });
      const created = await call<GoogleEvent>(
        `/calendar/v3/calendars/${encodeURIComponent(draft.calendarId)}/events?sendUpdates=all`,
        {
          body: {
            summary: draft.title,
            location: draft.location || undefined,
            description: draft.description || undefined,
            start: time(draft.start),
            end: time(draft.end),
          },
          write: true,
        },
      );
      return `Created “${draft.title}” in ${row.account}'s calendar (${created.id})`;
    },
    async deleteEvent(calendarId, eventId, etag) {
      await call(
        `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        { method: "DELETE", headers: etag ? { "if-match": etag } : {}, write: true },
      );
      return `Deleted the event from ${row.account}'s calendar`;
    },
  };
}
