import { type Block, type Inline, parseInline, parseMarkdown } from "@agent-v/shared";
import { memo, useMemo } from "react";
import { Linking, ScrollView, Text, View } from "react-native";

/**
 * Chat Markdown: paragraphs, headings, lists, quotes, code, tables, rules and inline styles.
 * While a reply streams, unfinished syntax is closed so raw `**` never flashes, and finished
 * blocks are memoized by their source, so each new token re-renders only the last block.
 */
export const Markdown = memo(function Markdown({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const blocks = useMemo(() => parseMarkdown(text, { streaming }), [text, streaming]);
  return (
    <View className="gap-3">
      {blocks.map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks only ever grow at the end
        <BlockView key={i} block={block} />
      ))}
    </View>
  );
});

const body = "text-[15px] leading-6 text-zinc-800 dark:text-zinc-200";

const BlockView = memo(
  function BlockView({ block }: { block: Block }) {
    switch (block.kind) {
      case "heading":
        return (
          <Text
            accessibilityRole="header"
            className={`${block.level === 1 ? "text-[19px]" : block.level === 2 ? "text-[17px]" : "text-[15px]"} font-semibold text-zinc-900 dark:text-zinc-50`}
          >
            <Spans text={block.text} />
          </Text>
        );
      case "paragraph":
        return (
          <Text selectable className={body}>
            <Spans text={block.text} />
          </Text>
        );
      case "quote":
        return (
          <View className="border-l-2 border-zinc-300 pl-3 dark:border-zinc-700">
            <Text selectable className="text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">
              <Spans text={block.text} />
            </Text>
          </View>
        );
      case "list":
        return (
          <View className="gap-1">
            {block.items.map((item, n) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: list items are positional
              <View key={n} className="flex-row gap-2 pr-2">
                <Text className="min-w-4 text-[15px] leading-6 text-zinc-400">{item.marker}</Text>
                <Text selectable className={`flex-1 ${body}`}>
                  <Spans text={item.text} />
                </Text>
              </View>
            ))}
          </View>
        );
      case "code":
        return (
          <View className="overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
            {block.language ? (
              <Text className="px-3 pt-2 text-[11px] uppercase tracking-wide text-zinc-400">
                {block.language}
              </Text>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text
                selectable
                className="p-3 font-mono text-[13px] text-zinc-800 dark:text-zinc-200"
              >
                {block.code}
              </Text>
            </ScrollView>
          </View>
        );
      case "table":
        return (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              {[block.header, ...block.rows].map((row, r) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                  key={r}
                  className={`flex-row ${r === 0 ? "bg-zinc-50 dark:bg-zinc-900" : "border-t border-zinc-100 dark:border-zinc-800"}`}
                >
                  {row.map((cell, c) => (
                    <Text
                      // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                      key={c}
                      selectable
                      className={`w-36 px-3 py-2 text-sm ${r === 0 ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}
                    >
                      <Spans text={cell} />
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
      case "rule":
        return <View className="h-px bg-zinc-200 dark:bg-zinc-800" />;
    }
  },
  // A finished block's source never changes, so it never re-renders.
  (a, b) =>
    a.block.source === b.block.source &&
    a.block.kind === b.block.kind &&
    sameText(a.block, b.block),
);

/** The streaming repair changes a block's text without changing its source. */
const sameText = (a: Block, b: Block) =>
  "text" in a && "text" in b ? a.text === b.text : JSON.stringify(a) === JSON.stringify(b);

function Spans({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((span: Inline, i) => {
        switch (span.kind) {
          case "text":
            return span.text;
          case "bold":
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional
              <Text key={i} className="font-semibold">
                {span.text}
              </Text>
            );
          case "italic":
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional
              <Text key={i} className="italic">
                {span.text}
              </Text>
            );
          case "strike":
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional
              <Text key={i} className="line-through">
                {span.text}
              </Text>
            );
          case "code":
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional
              <Text key={i} className="rounded bg-zinc-100 font-mono text-[13px] dark:bg-zinc-800">
                {span.text}
              </Text>
            );
          case "link":
            return (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional
                key={i}
                accessibilityRole="link"
                className="text-indigo-600 underline dark:text-indigo-400"
                onPress={() => void Linking.openURL(span.url)}
              >
                {span.text}
              </Text>
            );
        }
        return null;
      })}
    </>
  );
}
