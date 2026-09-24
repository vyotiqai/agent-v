import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { toModelMessages } from "../src/chat/convert.ts";
import { readConfig } from "../src/config.ts";
import { createModels, parseModelId } from "../src/models/registry.ts";
import { htmlToText, isPublicAddress, safeFetch } from "../src/net/safe-fetch.ts";

describe("isPublicAddress", () => {
  it.each([
    ["8.8.8.8", true],
    ["1.1.1.1", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.20.0.1", false],
    ["192.168.1.10", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["224.0.0.1", false],
    ["2606:4700:4700::1111", true],
    ["::1", false],
    ["::ffff:127.0.0.1", false],
    ["fd00::1", false],
    ["fe80::1", false],
    ["2001:db8::1", false],
    ["not-an-ip", false],
  ])("%s → %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe("safeFetch", () => {
  it("refuses private destinations, including after redirects", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/redirect") res.writeHead(302, { location: "http://127.0.0.1/" }).end();
      else res.end("<title>Local</title><p>hi</p>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow(/private or reserved/);
      await expect(safeFetch(`http://localhost:${port}/`)).rejects.toThrow(/private or reserved/);
      await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(/http and https/);
      await expect(safeFetch("http://user:pw@example.com/")).rejects.toThrow(/credentials/);
      const allowed = await safeFetch(`http://127.0.0.1:${port}/`, { allowPrivate: true });
      expect(allowed.body).toContain("Local");
    } finally {
      server.close();
    }
  });

  it("caps the body size", async () => {
    const server = createServer((_req, res) => res.end("x".repeat(10_000)));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const response = await safeFetch(`http://127.0.0.1:${port}/`, {
        allowPrivate: true,
        maxBytes: 100,
      });
      expect(response.body.length).toBe(100);
      expect(response.truncated).toBe(true);
    } finally {
      server.close();
    }
  });
});

describe("htmlToText", () => {
  it("keeps readable text and drops scripts", () => {
    const { title, text } = htmlToText(
      "<html><head><title>A &amp; B</title><style>p{}</style></head><body><script>evil()</script><h1>Hello</h1><p>World &#8212; ok</p></body></html>",
    );
    expect(title).toBe("A & B");
    expect(text).toBe("A & B\nHello\nWorld — ok");
  });
});

describe("toModelMessages", () => {
  it("drops tool calls that never got a result", () => {
    const messages = toModelMessages([
      { id: "1", role: "user", content: "hi" },
      {
        id: "2",
        role: "assistant",
        content: "Looking",
        toolCalls: [
          {
            id: "a",
            type: "function",
            function: { name: "web_fetch", arguments: '{"url":"https://x.y"}' },
          },
          { id: "b", type: "function", function: { name: "web_fetch", arguments: "{}" } },
        ],
      },
      { id: "3", role: "tool", toolCallId: "a", content: '{"title":"X"}' },
    ]);
    expect(messages).toEqual([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Looking" },
          {
            type: "tool-call",
            toolCallId: "a",
            toolName: "web_fetch",
            input: { url: "https://x.y" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "a",
            toolName: "web_fetch",
            output: { type: "json", value: { title: "X" } },
          },
        ],
      },
    ]);
  });
});

describe("model registry", () => {
  const base = { DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "s".repeat(32) };

  it("parses provider/model ids", () => {
    expect(parseModelId("openai/gpt-5.5")).toEqual({ provider: "openai", model: "gpt-5.5" });
    expect(parseModelId("ollama/qwen3:32b")).toEqual({ provider: "ollama", model: "qwen3:32b" });
    expect(() => parseModelId("gpt")).toThrow();
  });

  it("only offers models whose provider is configured", () => {
    const models = createModels(
      readConfig({
        ...base,
        DEFAULT_MODEL: "anthropic/claude-sonnet-5",
        ALLOWED_MODELS: "openai/gpt-5.5,anthropic/claude-sonnet-5",
        ANTHROPIC_API_KEY: "k",
        OPENAI_COMPATIBLE_PROVIDERS:
          '[{"name":"ollama","baseURL":"http://127.0.0.1:11434/v1","models":["llama3.3"]}]',
      }),
    );
    expect(models.options().map((o) => o.id)).toEqual([
      "anthropic/claude-sonnet-5",
      "ollama/llama3.3",
      "demo/agent-v",
    ]);
    expect(models.defaultModel).toBe("anthropic/claude-sonnet-5");
    expect(models.isAllowed("openai/gpt-5.5")).toBe(false);
    expect(() => models.resolve("openai/gpt-5.5")).toThrow(/not enabled/);
    expect(models.resolve("ollama/llama3.3")).toBeTruthy();
  });

  it("falls back to an available default and hides the demo model in production", () => {
    const models = createModels(
      readConfig({
        ...base,
        NODE_ENV: "production",
        DEFAULT_MODEL: "openai/gpt-5.5",
        OPENAI_API_KEY: "k",
      }),
    );
    expect(models.options().map((o) => o.id)).toEqual(["openai/gpt-5.5"]);
    expect(() =>
      readConfig({
        ...base,
        OPENAI_COMPATIBLE_PROVIDERS: '[{"name":"openai","baseURL":"http://x.y"}]',
      }),
    ).toThrow(/reserved/);
  });
});
