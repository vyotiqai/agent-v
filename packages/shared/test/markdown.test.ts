import { describe, expect, it } from "vitest";
import { closeInline, parseInline, parseMarkdown } from "../src/markdown.ts";

describe("markdown", () => {
  it("parses the blocks chat replies use", () => {
    const blocks = parseMarkdown(
      [
        "# Plan",
        "Some **bold** text",
        "and a second line.",
        "",
        "- one",
        "  continued",
        "2. two",
        "",
        "> quoted",
        "",
        "```ts",
        "const x = 1;",
        "```",
        "---",
        "| City | Temp |",
        "| --- | ---: |",
        "| Lisbon | 21 |",
        "| Porto |",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "quote",
      "code",
      "rule",
      "table",
    ]);
    expect(blocks[1]).toMatchObject({ text: "Some **bold** text\nand a second line." });
    expect(blocks[2]).toMatchObject({
      items: [
        { marker: "•", text: "one continued" },
        { marker: "2.", text: "two" },
      ],
    });
    expect(blocks[4]).toMatchObject({ language: "ts", code: "const x = 1;", open: false });
    expect(blocks[6]).toMatchObject({
      header: ["City", "Temp"],
      rows: [
        ["Lisbon", "21"],
        ["Porto", ""],
      ],
    });
  });

  it("never shows half-written syntax while streaming", () => {
    expect(closeInline("This is **impor")).toBe("This is **impor**");
    expect(closeInline("Use `npm i")).toBe("Use `npm i`");
    expect(closeInline("See [the docs](https://exa")).toBe("See the docs");
    expect(closeInline("See [the do")).toBe("See the do");
    expect(closeInline("Done **")).toBe("Done ");
    expect(closeInline("a *b* and *c")).toBe("a *b* and *c*");
    expect(closeInline("~~old")).toBe("~~old~~");
    expect(closeInline("`a*b` then **x")).toBe("`a*b` then **x**");
    expect(closeInline("complete **bold** and [a](https://a.b)")).toBe(
      "complete **bold** and [a](https://a.b)",
    );
    const streaming = parseMarkdown("Intro\n\n```py\nprint(1", { streaming: true });
    expect(streaming[1]).toMatchObject({ kind: "code", code: "print(1", open: true });
    expect(parseMarkdown("- a\n- **b", { streaming: true })[0]).toMatchObject({
      items: [{ text: "a" }, { text: "**b**" }],
    });
  });

  it("keeps finished blocks identical while the last one grows", () => {
    const a = parseMarkdown("First paragraph.\n\nSecond is gro", { streaming: true });
    const b = parseMarkdown("First paragraph.\n\nSecond is growing", { streaming: true });
    expect(a[0]).toEqual(b[0]);
    expect(a[1]?.source).not.toBe(b[1]?.source);
  });

  it("parses inline spans and bare links without trailing punctuation", () => {
    expect(parseInline("**b** *i* ~~s~~ `c` [l](https://x.y) https://a.b/c.")).toEqual([
      { kind: "bold", text: "b" },
      { kind: "text", text: " " },
      { kind: "italic", text: "i" },
      { kind: "text", text: " " },
      { kind: "strike", text: "s" },
      { kind: "text", text: " " },
      { kind: "code", text: "c" },
      { kind: "text", text: " " },
      { kind: "link", text: "l", url: "https://x.y" },
      { kind: "text", text: " " },
      { kind: "link", text: "https://a.b/c", url: "https://a.b/c" },
      { kind: "text", text: "." },
    ]);
  });
});
