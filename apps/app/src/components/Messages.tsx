import type { ChatMessage, ToolCall } from "@agent-v/shared";
import { router } from "expo-router";
import { memo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Markdown } from "./Markdown";
import { Icon, type IconName } from "./ui";

type Result = Extract<ChatMessage, { role: "tool" }>;

function parse(value: string | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function host(url: unknown) {
  try {
    return new URL(String(url)).host;
  } catch {
    return "a page";
  }
}

function describe(
  call: ToolCall,
  result?: Result,
): { icon: IconName; text: string; taskId?: string } {
  const args = parse(call.function.arguments);
  const output = parse(result?.content);
  const done = Boolean(result);
  switch (call.function.name) {
    case "web_fetch":
      return {
        icon: "globe",
        text: done ? `Read ${String(output.title || host(args.url))}` : `Reading ${host(args.url)}`,
      };
    case "delegate_task":
      return {
        icon: "zap",
        text: done
          ? `Started task · ${String(output.title ?? args.title ?? "")}`
          : "Starting a task",
        taskId: typeof output.id === "string" ? output.id : undefined,
      };
    case "remember_fact":
      return { icon: "bookmark", text: done ? "Saved to memory" : "Saving to memory" };
    case "task_status":
      return { icon: "list", text: done ? "Checked your tasks" : "Checking your tasks" };
    default:
      return { icon: "tool", text: call.function.name.replace(/_/g, " ") };
  }
}

/** A compact inline row for one tool call: what the agent did, and whether it finished. */
function ToolRow({ call, result }: { call: ToolCall; result?: Result }) {
  const { icon, text, taskId } = describe(call, result);
  const error = result?.error ?? (parse(result?.content).error as string | undefined);
  const row = (
    <View className="flex-row items-center gap-2.5 py-1">
      {result ? (
        <Icon
          name={error ? "alert-circle" : icon}
          size={15}
          className={error ? "text-red-500" : "text-zinc-400"}
        />
      ) : (
        <ActivityIndicator size="small" />
      )}
      <Text
        numberOfLines={1}
        className={`flex-1 text-sm ${error ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
      >
        {error ? `${text} — ${error}` : text}
      </Text>
      {taskId ? <Icon name="chevron-right" size={15} className="text-zinc-400" /> : null}
    </View>
  );
  if (!taskId) return row;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/tasks/${taskId}`)}
      className="active:opacity-60"
    >
      {row}
    </Pressable>
  );
}

export const MessageView = memo(function MessageView({
  message,
  results,
}: {
  message: ChatMessage;
  results: Map<string, Result>;
}) {
  if (message.role === "tool") return null;
  if (message.role === "user")
    return (
      <View className="w-full max-w-[760px] items-end self-center px-4 py-1.5">
        <View className="max-w-[85%] rounded-3xl bg-zinc-100 px-4 py-2.5 dark:bg-zinc-800">
          <Text selectable className="text-[15px] leading-6 text-zinc-900 dark:text-zinc-100">
            {message.content}
          </Text>
        </View>
      </View>
    );
  return (
    <View className="w-full max-w-[760px] gap-1 self-center px-4 py-1.5">
      {message.toolCalls?.map((call) => (
        <ToolRow key={call.id} call={call} result={results.get(call.id)} />
      ))}
      {message.content ? <Markdown text={message.content} /> : null}
    </View>
  );
});
