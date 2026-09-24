import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./helpers.ts";

// A fake OpenAI audio API: it checks the upload and returns a transcript.
let fake: Server;
const uploads: { model: string; type: string; size: number; auth: string }[] = [];
let server: TestServer;
let silent: TestServer | undefined;

beforeAll(async () => {
  fake = createServer(async (req, res) => {
    const request = new Request(`http://x${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req as unknown as ReadableStream,
      duplex: "half",
    } as RequestInit);
    const form = await request.formData();
    const file = form.get("file") as File;
    uploads.push({
      model: String(form.get("model")),
      type: file.type,
      size: file.size,
      auth: req.headers.authorization ?? "",
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ text: " Remind me to call Sam tomorrow. ", language: "en" }));
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
  server = await startTestServer({
    config: {
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: base,
      TRANSCRIPTION_MODEL: "openai/gpt-4o-mini-transcribe",
    },
  });
});
afterAll(async () => {
  await server?.close();
  await silent?.close();
  await new Promise((resolve) => fake?.close(resolve));
});

// The first bytes of a WebM (EBML) file, as browsers record with MediaRecorder.
const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array(2000).fill(1)]);

async function upload(token: string, blob: Blob, name = "voice.webm") {
  const form = new FormData();
  form.set("file", new File([blob], name, { type: blob.type }));
  return server.app.fetch(
    new Request("http://localhost:8787/api/voice/transcribe", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    }),
  );
}

describe("voice", () => {
  it("transcribes a recording with the configured model", async () => {
    const { token } = await server.signUp();
    expect((await server.json("/api/me", { token })).features.transcription).toBe(true);
    const response = await upload(token, new Blob([webm], { type: "audio/webm;codecs=opus" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ text: "Remind me to call Sam tomorrow." });
    expect(uploads.at(-1)).toMatchObject({
      model: "gpt-4o-mini-transcribe",
      type: "audio/webm",
      size: webm.length,
      auth: "Bearer sk-test",
    });
  });

  it("rejects what is not audio, and is off without a model", async () => {
    const { token } = await server.signUp();
    expect((await upload(token, new Blob(["hi"], { type: "text/plain" }), "a.txt")).status).toBe(
      415,
    );
    expect((await upload(token, new Blob([], { type: "audio/webm" }))).status).toBe(422);
    const anonymous = await server.app.fetch(
      new Request("http://localhost:8787/api/voice/transcribe", { method: "POST" }),
    );
    expect(anonymous.status).toBe(401);
  });
});
