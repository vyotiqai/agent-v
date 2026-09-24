import { Fragment, memo, type ReactNode } from "react";
import { Linking, Text, View } from "react-native";

/**
 * A small, fast Markdown subset for chat replies: paragraphs, headings, bullet and numbered
 * lists, quotes, code blocks, **bold**, *italic*, `code` and links. Streaming-safe: partial
 * syntax renders as plain text until it closes.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]?.startsWith("```")) code.push(lines[i++] ?? "");
      i++;
      blocks.push(
        <View key={blocks.length} className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
          <Text selectable className="font-mono text-[13px] text-zinc-800 dark:text-zinc-200">
            {code.join("\n")}
          </Text>
        </View>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <Text
          key={blocks.length}
          className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-50"
        >
          <Inline text={heading[2] ?? ""} />
        </Text>,
      );
      i++;
      continue;
    }
    const list = /^\s*([-*•]|\d+[.)])\s+/.exec(line);
    if (list) {
      const items: { marker: string; text: string }[] = [];
      while (i < lines.length) {
        const m = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(lines[i] ?? "");
        if (!m) break;
        items.push({ marker: /\d/.test(m[1] ?? "") ? (m[1] ?? "") : "•", text: m[2] ?? "" });
        i++;
      }
      blocks.push(
        <View key={blocks.length} className="gap-1">
          {items.map((item, n) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional and never reorder
            <View key={n} className="flex-row gap-2 pr-2">
              <Text className="w-4 text-[15px] leading-6 text-zinc-400">{item.marker}</Text>
              <Text
                selectable
                className="flex-1 text-[15px] leading-6 text-zinc-800 dark:text-zinc-200"
              >
                <Inline text={item.text} />
              </Text>
            </View>
          ))}
        </View>,
      );
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]?.startsWith(">"))
        quote.push((lines[i++] ?? "").replace(/^>\s?/, ""));
      blocks.push(
        <View key={blocks.length} className="border-l-2 border-zinc-300 pl-3 dark:border-zinc-700">
          <Text selectable className="text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
            <Inline text={quote.join("\n")} />
          </Text>
        </View>,
      );
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i]?.trim() &&
      !/^(```|#{1,3}\s|>|\s*([-*•]|\d+[.)])\s)/.test(lines[i] ?? "")
    )
      paragraph.push(lines[i++] ?? "");
    blocks.push(
      <Text
        key={blocks.length}
        selectable
        className="text-[15px] leading-6 text-zinc-800 dark:text-zinc-200"
      >
        <Inline text={paragraph.join("\n")} />
      </Text>,
    );
  }
  return <View className="gap-3">{blocks}</View>;
});

const inlinePattern =
  /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*)/g;

function Inline({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    if (token.startsWith("**"))
      parts.push(
        <Text key={start} className="font-semibold">
          {token.slice(2, -2)}
        </Text>,
      );
    else if (token.startsWith("`"))
      parts.push(
        <Text key={start} className="rounded bg-zinc-100 font-mono text-[13px] dark:bg-zinc-800">
          {token.slice(1, -1)}
        </Text>,
      );
    else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      parts.push(<Link key={start} url={match[2] ?? ""} label={label} />);
    } else if (token.startsWith("http")) parts.push(<Link key={start} url={token} label={token} />);
    else
      parts.push(
        <Text key={start} className="italic">
          {token.slice(1, -1)}
        </Text>,
      );
    last = start + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}

function Link({ url, label }: { url: string; label: string }) {
  return (
    <Text
      className="text-indigo-600 underline dark:text-indigo-400"
      onPress={() => void Linking.openURL(url)}
    >
      {label}
    </Text>
  );
}
