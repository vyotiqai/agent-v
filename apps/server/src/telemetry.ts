import { format } from "node:util";
import { OpenTelemetry } from "@ai-sdk/otel";
import {
  type Counter,
  context,
  type Histogram,
  metrics,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  MeterProvider,
  type MetricReader,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { registerTelemetry } from "ai";
import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import type { Config } from "./config.ts";

const tracer = () => trace.getTracer("agent-v");

let instruments: { requests: Histogram; tokens: Counter } | undefined;
function meter() {
  instruments ??= {
    requests: metrics
      .getMeter("agent-v")
      .createHistogram("http.server.request.duration", { unit: "s", description: "API requests" }),
    tokens: metrics
      .getMeter("agent-v")
      .createCounter("agent_v.tokens", { description: "Model tokens used" }),
  };
  return instruments;
}

/** Count model tokens (by model and direction) for dashboards. No-op without telemetry. */
export function countTokens(model: string, input: number, output: number) {
  const { tokens } = meter();
  if (input) tokens.add(input, { "gen_ai.request.model": model, direction: "input" });
  if (output) tokens.add(output, { "gen_ai.request.model": model, direction: "output" });
}

/** Per-call AI SDK telemetry settings: prompts and replies stay out of traces by default. */
export const aiTelemetry = (config: Config, functionId: string) => ({
  functionId,
  recordInputs: config.telemetry.recordContent,
  recordOutputs: config.telemetry.recordContent,
});

/**
 * Traces and metrics over OTLP/HTTP when OTEL_EXPORTER_OTLP_ENDPOINT is set (tests pass their
 * own processor and reader). Also turns on JSON logs when LOG_FORMAT=json.
 */
export function startTelemetry(
  config: Config,
  options: { spanProcessor?: SpanProcessor; metricReader?: MetricReader } = {},
) {
  if (config.telemetry.logFormat === "json") jsonLogs(config.telemetry.serviceName);
  const endpoint = config.telemetry.endpoint;
  if (!endpoint && !options.spanProcessor) return { enabled: false, shutdown: async () => {} };
  const resource = resourceFromAttributes({
    "service.name": config.telemetry.serviceName,
    "deployment.environment.name": config.env,
  });
  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [
      options.spanProcessor ??
        new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })),
    ],
  });
  // Registers the AsyncLocalStorage context manager and the W3C trace-context propagator.
  tracerProvider.register();
  const meterProvider = new MeterProvider({
    resource,
    readers: [
      options.metricReader ??
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
          exportIntervalMillis: 30_000,
        }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);
  instruments = undefined;
  registerTelemetry(new OpenTelemetry({ usage: true }));
  return {
    enabled: true,
    async shutdown() {
      await tracerProvider.shutdown().catch(() => {});
      await meterProvider.shutdown().catch(() => {});
      trace.disable();
      metrics.disable();
      propagation.disable();
      context.disable();
      instruments = undefined;
    },
  };
}

/** A server span per API request, continuing the caller's trace when it sends one. */
export function httpTracing(): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    const parent = propagation.extract(context.active(), Object.fromEntries(c.req.raw.headers));
    const span = tracer().startSpan(
      `${c.req.method}`,
      {
        kind: SpanKind.SERVER,
        attributes: { "http.request.method": c.req.method, "url.path": c.req.path },
      },
      parent,
    );
    try {
      await context.with(trace.setSpan(parent, span), next);
    } finally {
      // The matched route (not the raw path) keeps span names and metrics low-cardinality.
      const route = routePath(c, c.req.routeIndex) || c.req.path;
      const status = c.res.status;
      span.updateName(`${c.req.method} ${route}`);
      span.setAttributes({ "http.route": route, "http.response.status_code": status });
      if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      if (c.error) span.recordException(c.error);
      span.end();
      meter().requests.record((performance.now() - started) / 1000, {
        "http.request.method": c.req.method,
        "http.route": route,
        "http.response.status_code": status,
      });
    }
  };
}

let patched = false;
/** One JSON object per line, with the active trace so logs and traces join up. */
function jsonLogs(service: string) {
  if (patched) return;
  patched = true;
  const write =
    (level: string, stream: NodeJS.WriteStream) =>
    (...args: unknown[]) => {
      const span = trace.getActiveSpan()?.spanContext();
      stream.write(
        `${JSON.stringify({
          time: new Date().toISOString(),
          level,
          service,
          msg: format(...args),
          ...(span ? { trace_id: span.traceId, span_id: span.spanId } : {}),
        })}\n`,
      );
    };
  console.log = write("info", process.stdout);
  console.info = write("info", process.stdout);
  console.debug = write("debug", process.stdout);
  console.warn = write("warn", process.stderr);
  console.error = write("error", process.stderr);
}
