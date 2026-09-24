import type {
  CalendarEvent,
  EmailDraft,
  EventDraft,
  MailMessage,
  MailSummary,
} from "@agent-v/shared";

export interface Blob {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** Mail and calendar for one user, from Google or the demo workspace. */
export interface WorkspaceProvider {
  source: "google" | "demo";
  account: string;
  canWrite: boolean;
  searchMail(query: string, limit?: number): Promise<MailSummary[]>;
  getThread(threadId: string): Promise<MailMessage[]>;
  getAttachment(messageId: string, attachmentId: string): Promise<Blob>;
  sendMail(draft: EmailDraft, attachments: Blob[]): Promise<string>;
  listEvents(range: { from: string; to: string }): Promise<CalendarEvent[]>;
  createEvent(draft: EventDraft): Promise<string>;
  deleteEvent(calendarId: string, eventId: string, etag: string | null): Promise<string>;
}

/** Thrown when a write may or may not have happened (network drop, 5xx after sending). */
export class OutcomeUnknownError extends Error {
  readonly outcomeUnknown = true;
  constructor(message: string) {
    super(message);
    this.name = "OutcomeUnknownError";
  }
}

export const summarize = ({ body, ...rest }: MailMessage): MailSummary => rest;
