import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  type ECDH,
  hkdfSync,
  randomBytes,
  verify,
} from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must, startTestServer, type TestServer } from "./helpers.ts";

// A fake Expo push service and a fake browser push service.
let fake: Server;
let base = "";
const expoRequests: { to: string; title: string; body: string; data: Record<string, string> }[] =
  [];
const webRequests: { path: string; headers: Record<string, string>; body: Buffer }[] = [];
const goneTokens = new Set<string>();
let expoFailures = 0;
let webStatus = 201;

let server: TestServer;
beforeAll(async () => {
  fake = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    if (req.url === "/expo/send") {
      if (expoFailures > 0) {
        expoFailures--;
        res.writeHead(503).end();
        return;
      }
      const messages = JSON.parse(body.toString()) as (typeof expoRequests)[number][];
      expoRequests.push(...messages);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          data: messages.map((m) =>
            goneTokens.has(m.to)
              ? { status: "error", details: { error: "DeviceNotRegistered" } }
              : { status: "ok", id: randomBytes(4).toString("hex") },
          ),
        }),
      );
      return;
    }
    webRequests.push({ path: req.url ?? "", headers: req.headers as Record<string, string>, body });
    res.writeHead(webStatus).end();
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  server = await startTestServer({ config: { EXPO_PUSH_URL: `${base}/expo` } });
});
afterAll(async () => {
  await server?.close();
  await new Promise((resolve) => fake?.close(resolve));
});

async function eventually<T>(read: () => T | Promise<T>, done: (v: T) => boolean, ms = 15_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out; last ${JSON.stringify(value)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A browser's side of Web Push: its key pair and auth secret, and RFC 8291 decryption. */
function subscriber() {
  const ecdh: ECDH = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    decrypt(body: Buffer) {
      const salt = body.subarray(0, 16);
      const idLength = body[20] ?? 0;
      const serverKey = body.subarray(21, 21 + idLength);
      const ciphertext = body.subarray(21 + idLength);
      const shared = ecdh.computeSecret(serverKey);
      const info = Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), serverKey]);
      const ikm = Buffer.from(hkdfSync("sha256", shared, auth, info, 32));
      const key = Buffer.from(hkdfSync("sha256", ikm, salt, "Content-Encoding: aes128gcm\0", 16));
      const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, "Content-Encoding: nonce\0", 12));
      const decipher = createDecipheriv("aes-128-gcm", key, nonce);
      decipher.setAuthTag(ciphertext.subarray(-16));
      const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
      let end = plain.length - 1;
      while (plain[end] === 0) end--;
      if (plain[end] !== 2) throw new Error("Missing the last-record delimiter");
      return JSON.parse(plain.subarray(0, end).toString("utf8"));
    },
  };
}

/** Check the VAPID JWT: signed by the server's key, for the push service's origin. */
function checkVapid(header: string, endpoint: string, publicKey: string) {
  const [, jwt, key] = must(/^vapid t=([^,]+), k=(.+)$/.exec(header), "vapid header");
  expect(key).toBe(publicKey);
  const [head, payload, signature] = must(jwt).split(".");
  const raw = Buffer.from(publicKey, "base64url");
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: raw.subarray(1, 33).toString("base64url"),
    y: raw.subarray(33).toString("base64url"),
  };
  const ok = verify(
    "sha256",
    Buffer.from(`${head}.${payload}`),
    { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" },
    Buffer.from(must(signature), "base64url"),
  );
  expect(ok).toBe(true);
  const claims = JSON.parse(Buffer.from(must(payload), "base64url").toString());
  expect(claims.aud).toBe(new URL(endpoint).origin);
  expect(claims.exp * 1000).toBeGreaterThan(Date.now());
}

describe("push notifications", () => {
  it("pushes to phones and browsers by category, encrypted for each browser", async () => {
    const { token } = await server.signUp();
    const status = await server.json("/api/push", { token });
    expect(status).toMatchObject({
      devices: [],
      preferences: { needs_you: true, results: true, watches: true, ideas: false },
    });
    expect(status.webPushKey).toMatch(/^[\w-]{80,}$/);

    const phone = "ExponentPushToken[phone-1]";
    await server.json(
      "/api/push/devices",
      { token, body: { kind: "expo", token: phone, label: "Pixel" } },
      201,
    );
    const browser = subscriber();
    const endpoint = `${base}/web/sub-1`;
    await server.json(
      "/api/push/devices",
      { token, body: { kind: "webpush", endpoint, keys: browser.keys, label: "Chrome" } },
      201,
    );

    // A question from a task is pushed to both devices.
    const task = await server.json(
      "/api/tasks",
      { token, body: { prompt: "Plan it, but ask me first" } },
      201,
    );
    await server.waitForTask(token, task.id, ["waiting_input"]);
    const pushed = await eventually(
      () => expoRequests.filter((r) => r.to === phone),
      (list) => list.length === 1,
    );
    expect(pushed[0]).toMatchObject({
      title: "Your input is needed",
      data: { link: `/tasks/${task.id}` },
    });
    const web = await eventually(
      () => webRequests.filter((r) => r.path === "/web/sub-1"),
      (list) => list.length === 1,
    );
    const request = must(web[0]);
    expect(request.headers["content-encoding"]).toBe("aes128gcm");
    expect(Number(request.headers.ttl)).toBe(86400);
    checkVapid(request.headers.authorization ?? "", endpoint, status.webPushKey);
    expect(browser.decrypt(request.body)).toMatchObject({
      title: "Your input is needed",
      link: `/tasks/${task.id}`,
    });

    // With results turned off, finishing the task notifies in the app but pushes nothing.
    await server.json("/api/push/preferences", {
      token,
      method: "PATCH",
      body: { results: false },
    });
    await server.json(`/api/tasks/${task.id}/answer`, { token, body: { answer: "Go ahead" } });
    await server.waitForTask(token, task.id, ["succeeded"]);
    await new Promise((r) => setTimeout(r, 1500));
    expect(expoRequests.filter((r) => r.to === phone)).toHaveLength(1);
    const inApp = await server.json("/api/notifications", { token });
    expect(inApp.map((n: { category: string }) => n.category)).toEqual(["results", "needs_you"]);
  });

  it("removes devices the push services no longer know, and retries outages", async () => {
    const { token } = await server.signUp();
    const phone = "ExponentPushToken[phone-gone]";
    await server.json("/api/push/devices", { token, body: { kind: "expo", token: phone } }, 201);
    const browser = subscriber();
    await server.json(
      "/api/push/devices",
      { token, body: { kind: "webpush", endpoint: `${base}/web/gone`, keys: browser.keys } },
      201,
    );
    goneTokens.add(phone);
    webStatus = 410;
    await server.json("/api/push/test", { token, body: {} }, 409);
    expect((await server.json("/api/push", { token })).devices).toEqual([]);
    webStatus = 201;

    // A temporary outage is retried by the delivery workflow.
    const healthy = "ExponentPushToken[phone-ok]";
    await server.json("/api/push/devices", { token, body: { kind: "expo", token: healthy } }, 201);
    expoFailures = 1;
    const task = await server.json(
      "/api/tasks",
      { token, body: { prompt: "Ask me about it" } },
      201,
    );
    await server.waitForTask(token, task.id, ["waiting_input"]);
    await eventually(
      () => expoRequests.filter((r) => r.to === healthy),
      (list) => list.length === 1,
      20_000,
    );
    expect(expoFailures).toBe(0);
  }, 30_000);

  it("moves a device to the account that registers it last", async () => {
    const a = await server.signUp();
    const b = await server.signUp();
    const phone = "ExponentPushToken[shared-phone]";
    await server.json(
      "/api/push/devices",
      { token: a.token, body: { kind: "expo", token: phone } },
      201,
    );
    await server.json(
      "/api/push/devices",
      { token: b.token, body: { kind: "expo", token: phone } },
      201,
    );
    expect((await server.json("/api/push", { token: a.token })).devices).toEqual([]);
    expect((await server.json("/api/push", { token: b.token })).devices).toHaveLength(1);
    await server.json(
      "/api/push/devices",
      { token: a.token, body: { kind: "expo", token: "not a token" } },
      422,
    );
  });

  it("lets background tasks queue work from inside their steps", async () => {
    // Regression: starting a watch from a task step used to be refused by the workflow engine.
    const { token } = await server.signUp();
    const task = await server.json(
      "/api/tasks",
      { token, body: { prompt: "Watch demo://price and tell me when it's below $300" } },
      201,
    );
    const done = await server.waitForTask(token, task.id, ["succeeded", "failed"]);
    expect(done.task.status).toBe("succeeded");
    const [watch] = await server.json("/api/monitors", { token });
    await eventually(
      () => server.json(`/api/monitors/${watch.id}`, { token }),
      (d) => d.monitor.checks === 1,
    );
  });
});
