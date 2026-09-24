import { EventType } from "@ag-ui/core";
import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { cosineSimilarity } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashEmbedding } from "../src/memory/embed.ts";
import { relevantMemories, ruleFacts } from "../src/memory/service.ts";
import { DemoModel } from "../src/models/demo.ts";
import { startTestServer, type TestServer } from "./helpers.ts";

const prompts: string[] = [];
class SpyModel extends DemoModel {
  override doStream(options: LanguageModelV4CallOptions) {
    const system = options.prompt.find((m) => m.role === "system");
    if (system && typeof system.content === "string") prompts.push(system.content);
    return super.doStream(options);
  }
}

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer({ models: { "spy/model": () => new SpyModel("spy") } });
});
afterAll(async () => {
  await server?.close();
});

async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 15_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out; last ${JSON.stringify(value)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("semantic memory", () => {
  it("embeds offline so related wording lands close together", () => {
    const seat = hashEmbedding("Prefers window seats on flights");
    expect(
      cosineSimilarity(seat, hashEmbedding("I prefer a window seat when I fly")),
    ).toBeGreaterThan(
      cosineSimilarity(seat, hashEmbedding("My dentist is Dr. Lee on Main Street")) + 0.2,
    );
    expect(Math.hypot(...seat)).toBeCloseTo(1, 6);
  });

  it("saves each fact once and finds the ones that matter", async () => {
    const { token, userId } = await server.signUp();
    const first = await server.json(
      "/api/memories",
      { token, body: { text: "I prefer window seats" } },
      201,
    );
    const again = await server.json(
      "/api/memories",
      { token, body: { text: "I prefer window seats." } },
      201,
    );
    expect(again.id).toBe(first.id);
    for (const text of [
      "My dentist is Dr. Lee",
      "I am vegetarian",
      "My daughter Mia has swimming on Tuesdays",
      "I work at Acme as a designer",
      "My sister lives in Porto",
      "I like jazz and old films",
      "My car is a blue Honda",
      "I usually run in the mornings",
    ])
      await server.json("/api/memories", { token, body: { text } }, 201);
    const found = await relevantMemories(
      server.ctx,
      userId,
      "Book a flight: which seat do they want?",
      {
        limit: 2,
        recent: 0,
      },
    );
    expect(found[0]?.text).toBe("I prefer window seats");
    const food = await relevantMemories(
      server.ctx,
      userId,
      "restaurant ideas, I'm vegetarian friendly?",
      {
        limit: 1,
        recent: 0,
      },
    );
    expect(food.map((m) => m.text)).toEqual(["I am vegetarian"]);

    // Another person's memories never appear.
    const other = await server.signUp();
    expect(await relevantMemories(server.ctx, other.userId, "window seats")).toEqual([]);
  });

  it("re-embeds memories after the embedding model changes", async () => {
    const { token, userId } = await server.signUp();
    await server.json("/api/memories", { token, body: { text: "Allergic to peanuts" } }, 201);
    const original = server.ctx.embedder;
    let calls = 0;
    server.ctx.embedder = {
      id: "test/other",
      embed: async (texts) => {
        calls += texts.length;
        return texts.map((t) => hashEmbedding(`${t} `));
      },
    };
    try {
      const found = await relevantMemories(server.ctx, userId, "peanut allergy", { recent: 0 });
      expect(found.map((m) => m.text)).toEqual(["Allergic to peanuts"]);
      expect(calls).toBe(2); // one stored memory re-embedded, one query
      const row = await server.ctx.db.query.memories.findFirst({
        where: (m, { eq }) => eq(m.userId, userId),
      });
      expect(row?.embeddingModel).toBe("test/other");
    } finally {
      server.ctx.embedder = original;
    }
  });

  it("learns facts the owner states in chat, unless learning is off", async () => {
    expect(
      ruleFacts(
        "I'm allergic to peanuts and I prefer aisle seats. Can you plan dinner? Do I like sushi?",
      ),
    ).toEqual(["Prefers aisle seats", "Is allergic to peanuts"]);
    expect(ruleFacts("Remember that I like jazz. I'd like to book a table.")).toEqual([]);

    const { token } = await server.signUp();
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    await server.run(
      token,
      thread.id,
      "My sister's name is Ana. I'm vegetarian. Plan a dinner for us.",
    );
    const learned = await eventually(
      () => server.json("/api/memories", { token }),
      (list) => list.length === 2,
    );
    expect(
      learned.map((m: { text: string; origin: string }) => `${m.origin}:${m.text}`).sort(),
    ).toEqual(["chat:Is vegetarian", "chat:Their sister is Ana"]);
    // Saying it again adds nothing.
    await server.run(token, thread.id, "I'm vegetarian, remember.");
    await new Promise((r) => setTimeout(r, 1500));
    expect(await server.json("/api/memories", { token })).toHaveLength(2);

    const events = await server.run(token, thread.id, "What do you know about my sister?");
    expect(
      events
        .filter((e) => e.type === EventType.TOOL_CALL_START)
        .map((e) => (e as unknown as { toolCallName: string }).toolCallName),
    ).toEqual(["recall_memory"]);

    const quiet = await server.signUp();
    await server.json("/api/settings", {
      token: quiet.token,
      method: "PATCH",
      body: { learnMemories: false },
    });
    const t2 = await server.json("/api/threads", { token: quiet.token, body: {} }, 201);
    await server.run(quiet.token, t2.id, "I live in Lisbon. What's the weather like?");
    await new Promise((r) => setTimeout(r, 1500));
    expect(await server.json("/api/memories", { token: quiet.token })).toEqual([]);
  });

  it("puts the relevant memories in the prompt, not all of them", async () => {
    const { token } = await server.signUp();
    await server.json("/api/settings", {
      token,
      method: "PATCH",
      body: { model: "spy/model", learnMemories: false },
    });
    const facts = [
      "Prefers window seats",
      "Is allergic to shellfish",
      "Their dog is called Pixel",
      "Supports the Lisbon football club",
      "Plays the cello",
      "Drinks oat milk",
      "Their office is on the 4th floor",
      "Reads science fiction",
      "Likes hiking in the mountains",
      "Their brother is Tom",
    ];
    for (const text of facts) await server.json("/api/memories", { token, body: { text } }, 201);
    const thread = await server.json("/api/threads", { token, body: {} }, 201);
    prompts.length = 0;
    // The offline embedder matches shared wording ("shellfish"); real embedding models also
    // match meaning ("seafood").
    await server.run(token, thread.id, "Find me a seafood restaurant. Is shellfish a problem?");
    const system = prompts.at(-1) ?? "";
    expect(system).toContain("- Is allergic to shellfish");
    expect(system).not.toContain("Plays the cello");
    expect(system).toContain("recall_memory");
  });
});
