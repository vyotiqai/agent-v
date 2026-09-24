import { z } from "zod";

/** Mail, calendar, files and account connections: the personal workspace the agent works in. */

export interface MailAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface MailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string;
  snippet: string;
  /** Plain text. HTML mail is converted; it is never rendered. */
  body: string;
  labels: string[];
  attachments: MailAttachment[];
  /** RFC 5322 Message-ID, used to thread replies. */
  messageIdHeader: string | null;
}

export type MailSummary = Omit<MailMessage, "body">;

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  /** ISO date-time with offset, or YYYY-MM-DD for all-day events. */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  etag: string | null;
}

export type PdfFieldType = "text" | "checkbox" | "unsupported";
export interface PdfField {
  name: string;
  type: PdfFieldType;
  value: string | boolean | null;
}

export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  parentId: string | null;
  source: string;
  pageCount: number | null;
  fields: PdfField[];
  createdAt: string;
  /** Signed, short-lived link to the file's bytes. */
  url: string;
}

export interface Connection {
  provider: "google";
  account: string;
  capability: "read" | "write";
  connectedAt: string;
}

export interface WorkspaceStatus {
  /** Where mail and calendar come from right now. */
  source: "google" | "demo" | "none";
  account: string | null;
  canWrite: boolean;
  googleAvailable: boolean;
  connection: Connection | null;
}

const address = z.email().max(320);
const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\r\n]/.test(v), "Must be a single line");

export const emailDraftSchema = z.object({
  to: z.array(address).min(1).max(50),
  cc: z.array(address).max(50).default([]),
  subject: line(500),
  body: z.string().max(100_000),
  attachmentIds: z.array(z.string().min(1).max(100)).max(10).default([]),
  replyTo: z
    .object({ threadId: z.string().min(1).max(200), messageId: z.string().min(1).max(200) })
    .optional(),
});
export type EmailDraft = z.infer<typeof emailDraftSchema>;

const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
export const eventDraftSchema = z
  .object({
    title: line(300).pipe(z.string().min(1)),
    start: z.union([isoDateTime, isoDate]),
    end: z.union([isoDateTime, isoDate]),
    allDay: z.boolean().default(false),
    location: z.string().max(1000).default(""),
    description: z.string().max(8000).default(""),
    calendarId: z.string().min(1).max(300).default("primary"),
  })
  .refine(
    (e) => (e.allDay ? isoDate.safeParse(e.start).success : isoDateTime.safeParse(e.start).success),
    {
      message: "All-day events use dates; timed events use date-times with an offset",
      path: ["start"],
    },
  )
  .refine((e) => Date.parse(e.end) > Date.parse(e.start), {
    message: "The event must end after it starts",
    path: ["end"],
  });
export type EventDraft = z.infer<typeof eventDraftSchema>;

export const eventDeleteSchema = z.object({
  calendarId: z.string().min(1).max(300),
  eventId: z.string().min(1).max(300),
  title: z.string().max(300),
  etag: z.string().max(300).nullable(),
});

export const proposeActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("email.send"), payload: emailDraftSchema }),
  z.object({ kind: z.literal("calendar.create"), payload: eventDraftSchema }),
  z.object({ kind: z.literal("calendar.delete"), payload: eventDeleteSchema }),
]);

export const fillPdfSchema = z.object({
  values: z.record(z.string().min(1).max(300), z.union([z.string().max(2000), z.boolean()])),
});
export const importAttachmentSchema = z.object({
  messageId: z.string().min(1).max(200),
  attachmentId: z.string().min(1).max(2000),
});
