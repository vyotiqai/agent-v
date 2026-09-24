import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventType } from "@ag-ui/core";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, runMigrations } from "../src/db/client.ts";
import { threads } from "../src/db/schema.ts";
import { resetDatabase, startTestServer, type TestServer, testDatabaseUrl } from "./helpers.ts";

const spans = new InMemorySpanExporter();
const metricsOut = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({
  exporter: metricsOut,
  exportIntervalMillis: 60_000,
});
const web = mkdtempSync(join(tmpdir(), "agent-v-web-"));
mkdirSync(join(web, "_expo", "static", "js"), { recursive: true });
writeFileSync(join(web, "index.html"), "<!doctype html><title>Agent V</title>");
writeFileSync(join(web, "_expo", "static", "js", "entry-abc123.js"), "console.log(1)");

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer({
    config: { WEB_DIR: web },
    telemetry: { spanProcessor: new SimpleSpanProcessor(spans), metricReader: reader },
  });
});
afterAll(async () => {
  await server?.close();
});

describe("observability", () => {
  it("traces requests by route and model calls without personal content", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    spans.reset();
    await server.run(token, thread.id, "My secret recipe is lemon cake");
    const finished = spans.getFinishedSpans();
    const request = finished.find((s) => s.name === "POST /api/threads/:id/runs");
    expect(request?.attributes).toMatchObject({
      "http.route": "/api/threads/:id/runs",
      "http.response.status_code": 200,
    });
    const ai = finished.filter((s) => s.instrumentationScope.name !== "agent-v");
    expect(ai.length).toBeGreaterThan(0);
    // Model spans sit inside the request's trace.
    expect(ai.every((s) => s.spanContext().traceId === request?.spanContext().traceId)).toBe(true);
    const everything = JSON.stringify(finished.map((s) => s.attributes));
    expect(everything).toContain('"gen_ai.request.model":"agent-v"');
    expect(everything).not.toContain("lemon cake");

    // A caller's trace is continued.
    const parent = "4bf92f3577b34da6a3ce929d0e0e4736";
    await server.app.fetch(
      new Request("http://localhost:8787/api/threads", {
        headers: {
          authorization: `Bearer ${token}`,
          traceparent: `00-${parent}-00f067aa0ba902b7-01`,
        },
      }),
    );
    expect(
      spans
        .getFinishedSpans()
        .find((s) => s.name === "GET /api/threads")
        ?.spanContext().traceId,
    ).toBe(parent);

    await reader.forceFlush();
    const names = metricsOut
      .getMetrics()
      .flatMap((m) => m.scopeMetrics.flatMap((s) => s.metrics.map((x) => x.descriptor.name)));
    expect(names).toEqual(
      expect.arrayContaining(["http.server.request.duration", "agent_v.tokens"]),
    );
  });
});

describe("serving the web app", () => {
  it("serves the app, falls back to it for app routes and keeps /api JSON", async () => {
    const home = await server.call("/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("<title>Agent V</title>");
    expect(home.headers.get("cache-control")).toBe("no-cache");
    expect(home.headers.get("content-security-policy")).toContain("script-src 'self'");

    const deep = await server.call("/team?invite=abc");
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain("<title>Agent V</title>");

    const asset = await server.call("/_expo/static/js/entry-abc123.js");
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

    const api = await server.call("/api/nope");
    expect(api.status).toBe(401);
    const health = await server.json("/api/health");
    expect(health).toEqual({ ok: true });
  });
});

describe("running several replicas", () => {
  it("lets one reply run per chat, across processes, and frees a stale lease", async () => {
    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    const first = await server.call(`/api/threads/${thread.id}/runs`, {
      token,
      body: { content: "Tell me a long story please" },
    });
    expect(first.status).toBe(200);
    const second = await server.call(`/api/threads/${thread.id}/runs`, {
      token,
      body: { content: "And another" },
    });
    expect(second.status).toBe(409);
    await first.text();
    // Released after the reply is saved.
    const events = await server.run(token, thread.id, "Now?");
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);

    // A replica that crashed mid-reply leaves a lease that simply expires.
    await server.ctx.db
      .update(threads)
      .set({ runningUntil: sql`now() - interval '1 second'` })
      .where(sql`${threads.id} = ${thread.id}`);
    expect((await server.run(token, thread.id, "After a crash")).at(-1)?.type).toBe(
      EventType.RUN_FINISHED,
    );
  });

  it("migrates once when replicas start together", async () => {
    await resetDatabase();
    const a = createDatabase(testDatabaseUrl, 2);
    const b = createDatabase(testDatabaseUrl, 2);
    try {
      await Promise.all([runMigrations(a.db, a.pool), runMigrations(b.db, b.pool)]);
      const { rows } = await a.pool.query(
        "select count(*)::int as n from drizzle.__drizzle_migrations",
      );
      expect(rows[0].n).toBeGreaterThanOrEqual(7);
    } finally {
      await a.close();
      await b.close();
    }
  });
});
