import type { CalendarEvent, EmailDraft, EventDraft, MailMessage } from "@agent-v/shared";
import { eq, sql } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { Context } from "../context.ts";
import { demoWorkspaces } from "../db/schema.ts";
import { AppError, notFound } from "../errors.ts";
import { type Blob, summarize, type WorkspaceProvider } from "./types.ts";

export interface DemoWorkspaceData {
  mail: MailMessage[];
  events: CalendarEvent[];
  seq: number;
}

const me = "you@demo.agent-v";

function day(offset: number, hour: number, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seed(): DemoWorkspaceData {
  const message = (
    m: Partial<MailMessage> &
      Pick<MailMessage, "id" | "threadId" | "from" | "subject" | "body" | "date">,
  ): MailMessage => ({
    to: [me],
    cc: [],
    labels: ["INBOX"],
    attachments: [],
    messageIdHeader: `<${m.id}@demo.agent-v>`,
    snippet: m.body.replace(/\s+/g, " ").slice(0, 160),
    ...m,
  });
  return {
    seq: 100,
    mail: [
      message({
        id: "demo-m1",
        threadId: "demo-t1",
        from: "Ms. Rivera <rivera@school.example>",
        subject: "Aquarium trip permission slip",
        date: day(-1, 15, 12),
        body: "Hi,\n\nOur class is visiting the aquarium this Friday. Please fill in the attached permission slip and send it back by Thursday.\n\nWe leave at 8:15 and return by 16:30. Please pack a lunch and a water bottle.\n\nThank you!\nMs. Rivera",
        attachments: [
          {
            id: "permission-slip",
            name: "Permission slip.pdf",
            mimeType: "application/pdf",
            size: 0,
          },
        ],
      }),
      message({
        id: "demo-m2",
        threadId: "demo-t2",
        from: "Sam Park <sam@friends.example>",
        subject: "Dinner on Saturday?",
        date: day(-1, 9, 40),
        body: "Hey! Are you free for dinner on Saturday around 7? I was thinking of the new ramen place downtown.\n\nSam",
      }),
      message({
        id: "demo-m3",
        threadId: "demo-t3",
        from: "City Library <no-reply@library.example>",
        subject: "Your book is ready for pickup",
        date: day(-2, 11, 5),
        body: "“The Pragmatic Programmer” is waiting for you at the front desk until next Monday.",
      }),
    ],
    events: [
      {
        id: "demo-e1",
        calendarId: "primary",
        title: "Team standup",
        start: day(1, 9),
        end: day(1, 9, 15),
        allDay: false,
        location: "Video call",
        description: "",
        etag: '"1"',
      },
      {
        id: "demo-e2",
        calendarId: "primary",
        title: "Dentist",
        start: day(2, 14),
        end: day(2, 15),
        allDay: false,
        location: "Main St Dental",
        description: "",
        etag: '"1"',
      },
      {
        id: "demo-e3",
        calendarId: "primary",
        title: "Aquarium field trip",
        start: day(3, 0).slice(0, 10),
        end: day(4, 0).slice(0, 10),
        allDay: true,
        location: "City Aquarium",
        description: "",
        etag: '"1"',
      },
    ],
  };
}

/** A real, fillable form so the document flow can be tried end to end. */
export async function permissionSlipPdf() {
  const doc = await PDFDocument.create();
  doc.setTitle("Field trip permission slip");
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("Field trip permission slip", { x: 60, y: 720, size: 22, font: bold });
  page.drawText("City Aquarium · Friday · 8:15 to 16:30", {
    x: 60,
    y: 694,
    size: 12,
    font,
    color: rgb(0.35, 0.35, 0.4),
  });
  const form = doc.getForm();
  const fields: [string, number][] = [
    ["Student name", 620],
    ["Parent or guardian", 560],
    ["Emergency phone", 500],
  ];
  for (const [label, y] of fields) {
    page.drawText(label, { x: 60, y: y + 26, size: 11, font });
    const field = form.createTextField(label);
    field.addToPage(page, { x: 60, y, width: 360, height: 22, font });
  }
  page.drawText("Photos may be taken during the trip", { x: 90, y: 446, size: 11, font });
  form.createCheckBox("Photo consent").addToPage(page, { x: 60, y: 442, width: 18, height: 18 });
  page.drawText("Signed by the parent or guardian named above.", {
    x: 60,
    y: 390,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.4),
  });
  return doc.save();
}

async function load(ctx: Context, userId: string): Promise<DemoWorkspaceData> {
  await ctx.db.insert(demoWorkspaces).values({ userId, data: seed() }).onConflictDoNothing();
  const [row] = await ctx.db.select().from(demoWorkspaces).where(eq(demoWorkspaces.userId, userId));
  if (!row) throw new AppError("Demo workspace unavailable", 500);
  return row.data;
}

/** Read-modify-write under a row lock so concurrent writes cannot lose each other. */
async function update<T>(ctx: Context, userId: string, change: (data: DemoWorkspaceData) => T) {
  await load(ctx, userId);
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(demoWorkspaces)
      .where(eq(demoWorkspaces.userId, userId))
      .for("update");
    if (!row) throw new AppError("Demo workspace unavailable", 500);
    const data = row.data;
    const result = change(data);
    await tx
      .update(demoWorkspaces)
      .set({ data, updatedAt: sql`now()` })
      .where(eq(demoWorkspaces.userId, userId));
    return result;
  });
}

function matches(message: MailMessage, query: string) {
  const q = query.trim().toLowerCase();
  const inSent = /\bin:sent\b/.test(q);
  const words = q
    .replace(/\bin:\w+\b/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (inSent !== message.labels.includes("SENT")) return false;
  const haystack =
    `${message.from} ${message.to.join(" ")} ${message.subject} ${message.body}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export function demoProvider(ctx: Context, userId: string): WorkspaceProvider {
  return {
    source: "demo",
    account: me,
    canWrite: true,
    async searchMail(query, limit = 20) {
      const data = await load(ctx, userId);
      return data.mail
        .filter((m) => matches(m, query))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map(summarize);
    },
    async getThread(threadId) {
      const data = await load(ctx, userId);
      const thread = data.mail.filter((m) => m.threadId === threadId);
      if (!thread.length) throw notFound("Email thread");
      return thread.sort((a, b) => a.date.localeCompare(b.date));
    },
    async getAttachment(messageId, attachmentId): Promise<Blob> {
      const data = await load(ctx, userId);
      const attachment = data.mail
        .find((m) => m.id === messageId)
        ?.attachments.find((a) => a.id === attachmentId);
      if (!attachment || attachmentId !== "permission-slip") throw notFound("Attachment");
      return {
        name: attachment.name,
        mimeType: attachment.mimeType,
        bytes: await permissionSlipPdf(),
      };
    },
    async sendMail(draft: EmailDraft, attachments: Blob[]) {
      return update(ctx, userId, (data) => {
        const id = `demo-m${++data.seq}`;
        data.mail.push({
          id,
          threadId: draft.replyTo?.threadId ?? `demo-t${data.seq}`,
          from: `You <${me}>`,
          to: draft.to,
          cc: draft.cc,
          subject: draft.subject,
          date: new Date().toISOString(),
          snippet: draft.body.replace(/\s+/g, " ").slice(0, 160),
          body: draft.body,
          labels: ["SENT"],
          attachments: attachments.map((a, i) => ({
            id: `sent-${i}`,
            name: a.name,
            mimeType: a.mimeType,
            size: a.bytes.length,
          })),
          messageIdHeader: `<${id}@demo.agent-v>`,
        });
        return `Sent to ${draft.to.join(", ")} (demo mailbox; nothing left this server)`;
      });
    },
    async listEvents({ from, to }) {
      const data = await load(ctx, userId);
      return data.events
        .filter(
          (e) => Date.parse(e.end) >= Date.parse(from) && Date.parse(e.start) <= Date.parse(to),
        )
        .sort((a, b) => a.start.localeCompare(b.start));
    },
    async createEvent(draft: EventDraft) {
      return update(ctx, userId, (data) => {
        const id = `demo-e${++data.seq}`;
        data.events.push({ id, etag: '"1"', ...draft });
        return `Added “${draft.title}” to the demo calendar`;
      });
    },
    async deleteEvent(calendarId, eventId, etag) {
      return update(ctx, userId, (data) => {
        const event = data.events.find((e) => e.id === eventId && e.calendarId === calendarId);
        if (!event) throw notFound("Event");
        if (etag && event.etag !== etag)
          throw new AppError("The event changed since you reviewed it", 409);
        data.events = data.events.filter((e) => e !== event);
        return `Deleted “${event.title}” from the demo calendar`;
      });
    },
  };
}
