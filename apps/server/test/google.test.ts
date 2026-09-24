import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permissionSlipPdf } from "../src/providers/demo.ts";
import { buildMime } from "../src/providers/google/mime.ts";
import { Vault } from "../src/vault.ts";
import { must, startTestServer, type TestServer } from "./helpers.ts";

const b64 = (s: string | Uint8Array) => Buffer.from(s).toString("base64url");

/** A small fake of the Google endpoints Agent V uses. */
const google = {
  challenge: "",
  email: "ada@gmail.example",
  revoked: false,
  expireNextCall: false,
  sendStatus: 200,
  sent: [] as { raw: string; threadId?: string }[],
  created: [] as Record<string, unknown>[],
  deleted: [] as { path: string; ifMatch?: string }[],
  revokedTokens: [] as string[],
};

async function body(req: IncomingMessage) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data;
}

let fake: Server;
let base: string;
let server: TestServer;
let pdf: Uint8Array;

const htmlMessage = {
  id: "g1",
  threadId: "t1",
  labelIds: ["INBOX"],
  snippet: "Please sign",
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: "School <office@school.example>" },
      { name: "To", value: "ada@gmail.example" },
      { name: "Subject", value: "Form to sign" },
      { name: "Date", value: "Tue, 22 Sep 2026 10:00:00 +0000" },
      { name: "Message-ID", value: "<orig@mail.example>" },
    ],
    parts: [
      {
        mimeType: "text/html",
        headers: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
        body: { data: b64("<p>Please <b>sign</b> the form.</p><script>x()</script>") },
      },
      {
        mimeType: "application/pdf",
        filename: "form.pdf",
        body: { attachmentId: "a1", size: 100 },
      },
    ],
  },
};
const oddCharset = {
  id: "g2",
  threadId: "t2",
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "From", value: "x@y.example" },
      { name: "Subject", value: "Odd" },
      { name: "Content-Type", value: "text/plain; charset=x-unknown-charset" },
    ],
    body: { data: b64("still readable") },
  },
};

beforeAll(async () => {
  pdf = await permissionSlipPdf();
  fake = createServer(async (req, res) => {
    const url = new URL(req.url ?? "", "http://fake");
    const json = (status: number, value: unknown) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
    const auth = req.headers.authorization ?? "";
    if (url.pathname === "/token") {
      const form = new URLSearchParams(await body(req));
      if (form.get("client_secret") !== "secret") return json(401, { error: "invalid_client" });
      if (form.get("grant_type") === "authorization_code") {
        const verifier = form.get("code_verifier") ?? "";
        if (
          form.get("code") !== "good-code" ||
          createHash("sha256").update(verifier).digest("base64url") !== google.challenge
        )
          return json(400, { error: "invalid_grant" });
        return json(200, {
          access_token: "at-1",
          refresh_token: "rt-secret",
          expires_in: 3600,
          scope:
            "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events",
        });
      }
      if (google.revoked) return json(400, { error: "invalid_grant" });
      return json(200, { access_token: `at-${randomBytes(3).toString("hex")}`, expires_in: 3600 });
    }
    if (url.pathname === "/revoke") {
      google.revokedTokens.push(new URLSearchParams(await body(req)).get("token") ?? "");
      return json(200, {});
    }
    if (!auth.startsWith("Bearer at-")) return json(401, { error: { message: "no auth" } });
    if (google.expireNextCall && url.pathname !== "/oauth2/v3/userinfo") {
      google.expireNextCall = false;
      return json(401, { error: { message: "expired" } });
    }
    if (url.pathname === "/oauth2/v3/userinfo") return json(200, { email: google.email });
    if (url.pathname === "/gmail/v1/users/me/messages")
      return json(200, { messages: [{ id: "g1" }, { id: "g2" }, { id: "missing" }] });
    if (url.pathname === "/gmail/v1/users/me/messages/g1") return json(200, htmlMessage);
    if (url.pathname === "/gmail/v1/users/me/messages/g2") return json(200, oddCharset);
    if (url.pathname === "/gmail/v1/users/me/threads/t1")
      return json(200, { messages: [htmlMessage] });
    if (url.pathname === "/gmail/v1/users/me/messages/g1/attachments/a1")
      return json(200, { data: b64(pdf) });
    if (url.pathname === "/gmail/v1/users/me/messages/send") {
      const sent = JSON.parse(await body(req));
      if (google.sendStatus !== 200)
        return json(google.sendStatus, { error: { message: "backend" } });
      google.sent.push(sent);
      return json(200, { id: "sent-1" });
    }
    if (url.pathname === "/calendar/v3/calendars/primary/events" && req.method === "GET")
      return json(200, {
        items: [
          {
            id: "e1",
            etag: '"7"',
            summary: "Standup",
            start: { dateTime: "2026-09-25T09:00:00Z" },
            end: { dateTime: "2026-09-25T09:15:00Z" },
          },
          {
            id: "e2",
            status: "cancelled",
            summary: "Gone",
            start: { date: "2026-09-26" },
            end: { date: "2026-09-27" },
          },
        ],
      });
    if (url.pathname === "/calendar/v3/calendars/primary/events" && req.method === "POST") {
      google.created.push({
        ...JSON.parse(await body(req)),
        sendUpdates: url.searchParams.get("sendUpdates"),
      });
      return json(200, { id: "new-event" });
    }
    if (
      url.pathname.startsWith("/calendar/v3/calendars/primary/events/") &&
      req.method === "DELETE"
    ) {
      google.deleted.push({
        path: url.pathname,
        ifMatch: req.headers["if-match"] as string | undefined,
      });
      return res.writeHead(204).end();
    }
    return json(404, { error: { message: "not found" } });
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  server = await startTestServer({
    config: {
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      GOOGLE_ACCOUNTS_BASE: base,
      GOOGLE_OAUTH_BASE: base,
      GOOGLE_API_BASE: base,
    },
  });
});
afterAll(async () => {
  await server?.close();
  fake?.close();
});

async function connect(token: string) {
  const { url } = await server.json("/api/google/connect", {
    token,
    body: { capability: "write" },
  });
  const authorize = new URL(url);
  expect(authorize.origin + authorize.pathname).toBe(`${base}/o/oauth2/v2/auth`);
  expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
  expect(authorize.searchParams.get("redirect_uri")).toBe(
    "http://localhost:8787/api/google/callback",
  );
  google.challenge = authorize.searchParams.get("code_challenge") ?? "";
  const state = authorize.searchParams.get("state") ?? "";
  const callback = await server.call(`/api/google/callback?state=${state}&code=good-code`);
  expect(callback.status, (await callback.clone().text()).replace(/\s+/g, " ").slice(-300)).toBe(
    200,
  );
  return state;
}

async function approve(token: string, id: string) {
  const action = must(
    await server.ctx.db.query.actions.findFirst({
      where: (a, { eq }) => eq(a.id, id),
    }),
  );
  return server.json(`/api/actions/${id}/decide`, {
    token,
    body: { hash: action.hash, decision: "approve" },
  });
}

describe("Google workspace", () => {
  it("connects with PKCE, stores the refresh token encrypted, and never reuses a state", async () => {
    const { token, userId } = await server.signUp();
    expect((await server.json("/api/workspace", { token })).source).toBe("demo");
    const state = await connect(token);
    expect(await server.json("/api/workspace", { token })).toMatchObject({
      source: "google",
      account: "ada@gmail.example",
      canWrite: true,
      connection: { capability: "write" },
    });
    const row = must(
      await server.ctx.db.query.connections.findFirst({
        where: (c, { eq }) => eq(c.userId, userId),
      }),
    );
    expect(row.refreshToken).not.toContain("rt-secret");
    expect(
      new Vault(must(server.config.encryptionKey)).open(
        row.refreshToken,
        `connection:${userId}:google`,
      ),
    ).toBe("rt-secret");
    expect(() =>
      new Vault(must(server.config.encryptionKey)).open(
        row.refreshToken,
        "connection:someone-else:google",
      ),
    ).toThrow();
    const replay = await server.call(`/api/google/callback?state=${state}&code=good-code`);
    expect(replay.status).toBe(400);
    expect(await replay.text()).toContain("expired");
  });

  it("reads mail robustly and imports attachments", async () => {
    const { token } = await server.signUp();
    await connect(token);
    google.expireNextCall = true; // forces a token refresh mid-request
    const mail = await server.json("/api/mail?q=form", { token });
    expect(mail.map((m: { id: string }) => m.id)).toEqual(["g1", "g2"]);
    const [thread] = await server.json("/api/mail/threads/t1", { token });
    expect(thread.body).toBe("Please sign the form.");
    expect(thread.body).not.toContain("x()");
    const file = await server.json(
      "/api/mail/attachments/import",
      { token, body: { messageId: "g1", attachmentId: "a1" } },
      201,
    );
    expect(file.fields).toHaveLength(4);
    const events = await server.json("/api/calendar/events", { token });
    expect(events.map((e: { id: string }) => e.id)).toEqual(["e1"]);
  });

  it("sends exactly the reviewed email, threaded, with attachments", async () => {
    const { token } = await server.signUp();
    await connect(token);
    const file = await server.json(
      "/api/mail/attachments/import",
      { token, body: { messageId: "g1", attachmentId: "a1" } },
      201,
    );
    const proposed = await server.json(
      "/api/actions",
      {
        token,
        body: {
          kind: "email.send",
          payload: {
            to: ["office@school.example"],
            subject: "Café ☕ form",
            body: "Signed.\nThanks",
            attachmentIds: [file.id],
            replyTo: { threadId: "t1", messageId: "g1" },
          },
        },
      },
      201,
    );
    expect(google.sent).toHaveLength(0);
    expect((await approve(token, proposed.id)).status).toBe("succeeded");
    const sent = must(google.sent.at(-1));
    expect(sent.threadId).toBe("t1");
    const raw = Buffer.from(sent.raw, "base64url").toString();
    expect(raw).toContain("From: ada@gmail.example\r\n");
    expect(raw).toContain("To: office@school.example\r\n");
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from("Café ☕ form").toString("base64")}?=`);
    expect(raw).toContain("In-Reply-To: <orig@mail.example>");
    expect(raw).toContain('filename="form.pdf"');
    expect(raw).toContain("multipart/mixed");
  });

  it("reports uncertain sends as outcome unknown, never as failed or retried", async () => {
    const { token } = await server.signUp();
    await connect(token);
    const proposed = await server.json(
      "/api/actions",
      {
        token,
        body: { kind: "email.send", payload: { to: ["a@b.example"], subject: "Hi", body: "x" } },
      },
      201,
    );
    google.sendStatus = 503;
    const result = await approve(token, proposed.id);
    google.sendStatus = 200;
    expect(result.status).toBe("outcome_unknown");
    await server.json(
      `/api/actions/${proposed.id}/decide`,
      { token, body: { hash: result.hash, decision: "approve" } },
      409,
    );
  });

  it("creates and deletes calendar events with the reviewed version", async () => {
    const { token } = await server.signUp();
    await connect(token);
    const create = await server.json(
      "/api/actions",
      {
        token,
        body: {
          kind: "calendar.create",
          payload: {
            title: "Lunch",
            start: "2026-09-30T12:00:00+02:00",
            end: "2026-09-30T13:00:00+02:00",
          },
        },
      },
      201,
    );
    expect((await approve(token, create.id)).status).toBe("succeeded");
    expect(google.created.at(-1)).toMatchObject({
      summary: "Lunch",
      start: { dateTime: "2026-09-30T12:00:00+02:00" },
      sendUpdates: "all",
    });
    const remove = await server.json(
      "/api/actions",
      {
        token,
        body: {
          kind: "calendar.delete",
          payload: { calendarId: "primary", eventId: "e1", title: "Standup", etag: '"7"' },
        },
      },
      201,
    );
    expect((await approve(token, remove.id)).status).toBe("succeeded");
    expect(google.deleted.at(-1)).toEqual({
      path: "/calendar/v3/calendars/primary/events/e1",
      ifMatch: '"7"',
    });
    await server.json(
      "/api/actions",
      {
        token,
        body: {
          kind: "calendar.create",
          payload: { title: "Bad", start: "2026-09-30", end: "2026-09-29", allDay: true },
        },
      },
      422,
    );
  });

  it("refuses to run a reviewed action on a different account", async () => {
    const { token } = await server.signUp();
    await connect(token);
    const proposed = await server.json(
      "/api/actions",
      {
        token,
        body: { kind: "email.send", payload: { to: ["a@b.example"], subject: "Hi", body: "x" } },
      },
      201,
    );
    await server.json("/api/google/disconnect", { token, body: {} });
    expect(google.revokedTokens).toContain("rt-secret");
    google.email = "other@gmail.example";
    await connect(token);
    google.email = "ada@gmail.example";
    const result = await approve(token, proposed.id);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("reviewed for ada@gmail.example");
  });

  it("drops a revoked connection and falls back to the demo mailbox", async () => {
    const { token } = await server.signUp();
    await connect(token);
    google.revoked = true;
    try {
      // The next call is rejected, so the server must refresh, and the refresh is refused.
      google.expireNextCall = true;
      const response = await server.call("/api/mail", { token });
      expect(response.status).toBe(409);
      expect(((await response.json()) as { error: string }).error).toContain("revoked");
      expect((await server.json("/api/workspace", { token })).source).toBe("demo");
    } finally {
      google.revoked = false;
    }
  });
});

describe("mime", () => {
  it("rejects header injection", () => {
    expect(() =>
      buildMime(
        {
          to: ["a@b.example"],
          cc: [],
          subject: "Hi\r\nBcc: x@y.example",
          body: "",
          attachmentIds: [],
        },
        "me@x.example",
        [],
      ),
    ).toThrow(/single line/);
  });
});
