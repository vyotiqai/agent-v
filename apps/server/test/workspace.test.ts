import { EventType } from "@ag-ui/core";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fillPdf, inspectPdf } from "../src/files/pdf.ts";
import { permissionSlipPdf } from "../src/providers/demo.ts";
import { must, startTestServer, type TestServer } from "./helpers.ts";

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server?.close();
});

const local = (url: string) => url.replace("http://localhost:8787", "");

describe("demo workspace", () => {
  it("serves a private mailbox, calendar and attachments", async () => {
    const { token } = await server.signUp();
    const other = await server.signUp();
    expect(await server.json("/api/workspace", { token })).toMatchObject({
      source: "demo",
      canWrite: true,
      googleAvailable: false,
    });
    const inbox = await server.json("/api/mail", { token });
    expect(inbox.map((m: { subject: string }) => m.subject)).toEqual([
      "Aquarium trip permission slip",
      "Dinner on Saturday?",
      "Your book is ready for pickup",
    ]);
    expect((await server.json("/api/mail?q=ramen", { token }))[0].subject).toBe(
      "Dinner on Saturday?",
    );
    const [thread] = await server.json(`/api/mail/threads/${inbox[0].threadId}`, { token });
    expect(thread.body).toContain("permission slip");
    const events = await server.json("/api/calendar/events", { token });
    expect(events.map((e: { title: string }) => e.title)).toContain("Dentist");

    const file = await server.json(
      "/api/mail/attachments/import",
      { token, body: { messageId: inbox[0].id, attachmentId: "permission-slip" } },
      201,
    );
    expect(file).toMatchObject({
      name: "Permission slip.pdf",
      pageCount: 1,
      source: "Email attachment",
    });
    expect(file.fields.map((f: { name: string }) => f.name)).toEqual([
      "Student name",
      "Parent or guardian",
      "Emergency phone",
      "Photo consent",
    ]);
    const content = await server.call(local(file.url));
    expect(content.headers.get("content-type")).toBe("application/pdf");
    expect(
      Buffer.from(await content.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    expect((await server.call(local(file.url).replace(/s=[^&]+/, "s=forged"))).status).toBe(401);
    await server.json(`/api/files/${file.id}`, { token: other.token }, 404);
    expect(await server.json("/api/files", { token: other.token })).toEqual([]);
    expect(await server.json("/api/mail?q=permission", { token: other.token })).toHaveLength(1);
  });

  it("fills a copy of a form and keeps the original", async () => {
    const { token } = await server.signUp();
    const [mail] = await server.json("/api/mail?q=permission", { token });
    const original = await server.json(
      "/api/mail/attachments/import",
      { token, body: { messageId: mail.id, attachmentId: "permission-slip" } },
      201,
    );
    const filled = await server.json(
      `/api/files/${original.id}/fill`,
      { token, body: { values: { "Student name": "Alex Kim", "Photo consent": true } } },
      201,
    );
    expect(filled).toMatchObject({ name: "Permission slip (filled).pdf", parentId: original.id });
    expect(filled.fields.find((f: { name: string }) => f.name === "Student name").value).toBe(
      "Alex Kim",
    );
    expect(filled.fields.find((f: { name: string }) => f.name === "Photo consent").value).toBe(
      true,
    );
    const again = await server.json(`/api/files/${original.id}`, { token });
    expect(again.fields[0].value).toBe("");
    await server.json(
      `/api/files/${original.id}/fill`,
      { token, body: { values: { Nope: "x" } } },
      422,
    );
  });

  it("uploads PDFs only", async () => {
    const { token } = await server.signUp();
    const upload = async (bytes: Uint8Array, name: string) => {
      const form = new FormData();
      form.set("file", new File([bytes], name));
      return server.app.fetch(
        new Request("http://localhost:8787/api/files", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: form,
        }),
      );
    };
    const ok = await upload(await permissionSlipPdf(), "../../etc/slip.pdf");
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { name: string }).name).toBe(".. .. etc slip.pdf");
    expect((await upload(new TextEncoder().encode("hello"), "a.pdf")).status).toBe(415);
  });

  it("proposes a reply from chat and sends it only after approval", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    const events = await server.run(token, thread.id, "Reply to Sam: count me in for Saturday!");
    const names = events
      .filter((e) => e.type === EventType.TOOL_CALL_START)
      .map((e) => (e as unknown as { toolCallName: string }).toolCallName);
    expect(names).toEqual(["search_mail", "propose_email"]);
    const result = JSON.parse(
      (
        events.filter((e) => e.type === EventType.TOOL_CALL_RESULT).at(-1) as unknown as {
          content: string;
        }
      ).content,
    );
    expect(result.status).toBe("awaiting_review");
    expect(await server.json("/api/mail?q=in:sent", { token })).toEqual([]);

    const pending = await server.json(`/api/tasks`, { token });
    expect(pending).toEqual([]);
    const action = await server.json(
      `/api/actions/${result.actionId}/decide`,
      {
        token,
        body: { hash: "0".repeat(64), decision: "approve" },
      },
      409,
    );
    expect(action.error).toContain("changed");
    // The app reads the hash from the action it shows.
    const detail = must(
      await server.ctx.db.query.actions.findFirst({
        where: (a, { eq }) => eq(a.id, result.actionId),
      }),
    );
    expect(detail.payload).toMatchObject({
      to: ["sam@friends.example"],
      subject: "Re: Dinner on Saturday?",
      body: "count me in for Saturday!",
      account: "you@demo.agent-v",
      replyTo: { threadId: "demo-t2", messageId: "demo-m2" },
    });
    const done = await server.json(`/api/actions/${result.actionId}/decide`, {
      token,
      body: { hash: detail.hash, decision: "approve" },
    });
    expect(done).toMatchObject({ status: "succeeded" });
    const [sent] = await server.json("/api/mail?q=in:sent", { token });
    expect(sent).toMatchObject({ subject: "Re: Dinner on Saturday?", threadId: "demo-t2" });
  });

  it("completes the permission slip end to end as a durable task", async () => {
    const { token } = await server.signUp();
    const created = await server.json(
      "/api/tasks",
      { token, body: { prompt: "Complete the permission slip" } },
      201,
    );
    let detail = await server.waitForTask(token, created.id, ["waiting_input"]);
    expect(detail.task.question).toContain(
      "Student name, Parent or guardian, Emergency phone, Photo consent (yes/no)",
    );
    await server.json(`/api/tasks/${created.id}/answer`, {
      token,
      body: {
        answer:
          "Student name: Alex Kim; Parent or guardian: Jo Kim; Emergency phone: 555-0100; Photo consent: yes",
      },
    });
    detail = await server.waitForTask(token, created.id, ["waiting_approval"]);
    const { action } = detail;
    expect(action.kind).toBe("email.send");
    expect(action.payload).toMatchObject({
      to: ["rivera@school.example"],
      subject: "Re: Aquarium trip permission slip",
      replyTo: { threadId: "demo-t1", messageId: "demo-m1" },
    });
    const filled = await server.json(`/api/files/${action.payload.attachmentIds[0]}`, { token });
    expect(
      Object.fromEntries(
        filled.fields.map((f: { name: string; value: unknown }) => [f.name, f.value]),
      ),
    ).toEqual({
      "Student name": "Alex Kim",
      "Parent or guardian": "Jo Kim",
      "Emergency phone": "555-0100",
      "Photo consent": true,
    });
    await server.json(`/api/actions/${action.id}/decide`, {
      token,
      body: { hash: action.hash, decision: "approve" },
    });
    detail = await server.waitForTask(token, created.id, ["succeeded"]);
    expect(detail.task.result).toContain("sent it back to rivera@school.example");
    const [sent] = await server.json("/api/mail?q=in:sent", { token });
    expect(sent.attachments.map((a: { name: string }) => a.name)).toEqual([
      "Permission slip (filled).pdf",
    ]);
  });
});

describe("pdf", () => {
  it("strips scripts from filled copies", async () => {
    const doc = await PDFDocument.load(await permissionSlipPdf());
    const js = doc.context.obj({
      Type: "Action",
      S: "JavaScript",
      JS: PDFString.of("app.alert(1)"),
    });
    doc.catalog.set(PDFName.of("OpenAction"), doc.context.register(js));
    const withScript = await doc.save();
    expect((await PDFDocument.load(withScript)).catalog.has(PDFName.of("OpenAction"))).toBe(true);
    const filled = await fillPdf(withScript, { "Student name": "A" });
    expect((await PDFDocument.load(filled.bytes)).catalog.has(PDFName.of("OpenAction"))).toBe(
      false,
    );
    expect((await inspectPdf(filled.bytes)).fields[0]).toEqual({
      name: "Student name",
      type: "text",
      value: "A",
    });
    await expect(inspectPdf(new TextEncoder().encode("%PDF-garbage"))).rejects.toThrow(
      /could not be read/,
    );
  });
});
