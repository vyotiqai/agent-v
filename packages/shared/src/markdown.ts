/**
 * A small Markdown parser for chat replies, built for streaming: text arrives a few characters
 * at a time, so the parse must be cheap, must never flash raw syntax (`**bo` before `**bold**`
 * closes), and must keep finished blocks stable so a renderer can skip them.
 */
export type Block =
  | { kind: "paragraph"; source: string; text: string }
  | { kind: "heading"; source: string; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "list"; source: string; items: { marker: string; text: string }[] }
  | { kind: "quote"; source: string; text: string }
  | { kind: "code"; source: string; language: string; code: string; open: boolean }
  | { kind: "table"; source: string; header: string[]; rows: string[][] }
  | { kind: "rule"; source: string };

const listItem = /^\s*([-*+•]|\d+[.)])\s+(.*)$/;
const blockStart = /^(```|#{1,4}\s|>|\s*([-*+•]|\d+[.)])\s|\s*(-{3,}|\*{3,}|_{3,})\s*$|\s*\|)/;
const tableSeparator = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function parseMarkdown(input: string, options: { streaming?: boolean } = {}): Block[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const take = (from: number) => lines.slice(from, i).join("\n");
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const start = i;
    const fence = /^```\s*([\w+-]*)/.exec(line);
    if (fence) {
      i++;
      const code: string[] = [];
      while (i < lines.length && !lines[i]?.startsWith("```")) code.push(lines[i++] ?? "");
      const open = i >= lines.length;
      if (!open) i++;
      blocks.push({
        kind: "code",
        source: take(start),
        language: fence[1] ?? "",
        code: code.join("\n"),
        open,
      });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      i++;
      blocks.push({
        kind: "heading",
        source: line,
        level: (heading[1]?.length ?? 1) as 1 | 2 | 3 | 4,
        text: heading[2] ?? "",
      });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      i++;
      blocks.push({ kind: "rule", source: line });
      continue;
    }
    if (line.includes("|") && tableSeparator.test(lines[i + 1] ?? "")) {
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]?.includes("|") && lines[i]?.trim()) {
        const row = cells(lines[i] ?? "");
        rows.push(header.map((_, n) => row[n] ?? ""));
        i++;
      }
      blocks.push({ kind: "table", source: take(start), header, rows });
      continue;
    }
    if (listItem.test(line)) {
      const items: { marker: string; text: string }[] = [];
      while (i < lines.length) {
        const m = listItem.exec(lines[i] ?? "");
        if (m) {
          items.push({ marker: /\d/.test(m[1] ?? "") ? (m[1] ?? "") : "•", text: m[2] ?? "" });
          i++;
        } else if (items.length && /^\s{2,}\S/.test(lines[i] ?? "")) {
          // An indented continuation line belongs to the previous item.
          const last = items[items.length - 1];
          if (last) last.text += ` ${(lines[i] ?? "").trim()}`;
          i++;
        } else break;
      }
      blocks.push({ kind: "list", source: take(start), items });
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]?.startsWith(">"))
        quote.push((lines[i++] ?? "").replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", source: take(start), text: quote.join("\n") });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i]?.trim() &&
      (i === start || !blockStart.test(lines[i] ?? ""))
    )
      paragraph.push(lines[i++] ?? "");
    blocks.push({ kind: "paragraph", source: take(start), text: paragraph.join("\n") });
  }
  if (options.streaming) {
    const last = blocks.at(-1);
    if (last) blocks[blocks.length - 1] = closeBlock(last);
  }
  return blocks;
}

/** While streaming, the last block may end mid-syntax: close it so it renders cleanly. */
function closeBlock(block: Block): Block {
  switch (block.kind) {
    case "paragraph":
    case "quote":
    case "heading":
      return { ...block, text: closeInline(block.text) };
    case "list": {
      const items = block.items.slice();
      const last = items.at(-1);
      if (last) items[items.length - 1] = { ...last, text: closeInline(last.text) };
      return { ...block, items };
    }
    default:
      return block;
  }
}

/**
 * Close unfinished inline syntax at the end of streamed text: `**bold`, `*it`, `` `code ``,
 * `~~strike`, and a half-written link `[label](http…` (shown as its label).
 */
export function closeInline(text: string): string {
  let out = text;
  const link = /\[([^\]]*)(\]\([^)]*)?$/.exec(out);
  if (link) out = out.slice(0, link.index) + (link[1] ?? "");
  // An opener with nothing after it is dropped; one with text after it is closed.
  const settle = (marker: string, count: number) => {
    if (count % 2 === 0) return;
    if (out.endsWith(marker)) out = out.slice(0, -marker.length);
    else out += marker;
  };
  settle("`", (out.match(/`/g) ?? []).length);
  // Markers inside code spans do not count.
  const plain = () => out.replace(/`[^`]*`/g, "");
  settle("~~", (plain().match(/~~/g) ?? []).length);
  settle("**", (plain().match(/\*\*/g) ?? []).length);
  settle("*", (plain().replace(/\*\*/g, "").match(/\*/g) ?? []).length);
  return out;
}

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold" | "italic" | "strike" | "code"; text: string }
  | { kind: "link"; text: string; url: string };

const inlinePattern =
  /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)<>]+[^\s)<>.,;:!?]|\*[^*\s][^*]*\*)/g;

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    if (token.startsWith("**")) parts.push({ kind: "bold", text: token.slice(2, -2) });
    else if (token.startsWith("~~")) parts.push({ kind: "strike", text: token.slice(2, -2) });
    else if (token.startsWith("`")) parts.push({ kind: "code", text: token.slice(1, -1) });
    else if (token.startsWith("["))
      parts.push({ kind: "link", text: token.slice(1, token.indexOf("]")), url: match[2] ?? "" });
    else if (token.startsWith("http")) parts.push({ kind: "link", text: token, url: token });
    else parts.push({ kind: "italic", text: token.slice(1, -1) });
    last = start + token.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
