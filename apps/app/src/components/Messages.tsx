import type { ChatMessage, ToolCall } from "@agent-v/shared";
import { router } from "expo-router";
import { memo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ActionCard } from "./ActionReview";
import { BrowserCard } from "./BrowserCard";
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
    case "browse":
      return {
        icon: "compass",
        text: done
          ? `Browsed ${String(output.title || host(args.url))}`
          : `Opening ${host(args.url)}`,
      };
    case "click_link":
      return {
        icon: "link",
        text: done ? `Followed “${String(args.name ?? "")}”` : "Following a link",
      };
    case "read_page":
      return { icon: "file-text", text: done ? "Read the page again" : "Reading the page" };
    case "search_mail": {
      const found = Array.isArray(output) ? output.length : 0;
      return {
        icon: "mail",
        text: done
          ? `Found ${found} email${found === 1 ? "" : "s"}${args.query ? ` for “${String(args.query)}”` : ""}`
          : "Searching mail",
      };
    }
    case "read_email_thread":
      return { icon: "mail", text: done ? "Read an email thread" : "Reading an email thread" };
    case "list_events":
      return { icon: "calendar", text: done ? "Checked your calendar" : "Checking your calendar" };
    case "propose_email":
      return {
        icon: "send",
        text: done ? "Prepared an email for your review" : "Preparing an email",
      };
    case "propose_event":
      return {
        icon: "calendar",
        text: done ? "Prepared an event for your review" : "Preparing an event",
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

/** The action id a propose_* tool created, so chat can show its approval card. */
function proposalOf(call: ToolCall, result: Result | undefined) {
  if (!call.function.name.startsWith("propose_")) return null;
  const output = parse(result?.content);
  return typeof output.actionId === "string" ? output.actionId : null;
}

export const browserTools = new Set(["browse", "click_link", "read_page"]);

/** The session id a browser tool result points at, if it succeeded. */
export function browserSessionOf(result: Result | undefined): string | null {
  const output = parse(result?.content);
  return typeof output.sessionId === "string" && !output.error ? output.sessionId : null;
}

export const MessageView = memo(function MessageView({
  message,
  results,
  liveCallId,
}: {
  message: ChatMessage;
  results: Map<string, Result>;
  /** The newest browser tool call in the chat; it shows the live browser card. */
  liveCallId?: string | null;
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
      {message.toolCalls?.map((call) => {
        const result = results.get(call.id);
        const session = call.id === liveCallId ? browserSessionOf(result) : null;
        return (
          <View key={call.id}>
            <ToolRow call={call} result={result} />
            {session ? <BrowserCard sessionId={session} /> : null}
            {proposalOf(call, result) ? (
              <ActionCard actionId={proposalOf(call, result) ?? ""} />
            ) : null}
          </View>
        );
      })}
      {message.content ? <Markdown text={message.content} /> : null}
    </View>
  );
});
