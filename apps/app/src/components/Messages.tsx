import type { ChatMessage, ToolCall } from "@agent-v/shared";
import { router } from "expo-router";
import { memo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { speak, speakingId, stopSpeaking } from "../lib/speech";
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
): { icon: IconName; text: string; href?: string } {
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
    case "computer_run": {
      const status = typeof output.status === "string" ? output.status : "";
      return {
        icon: "terminal",
        text: done
          ? `Ran \`${String(args.command ?? "").slice(0, 60)}\` · ${status === "succeeded" ? "exit 0" : status.replace("_", " ") || "done"}`
          : `Running \`${String(args.command ?? "").slice(0, 60)}\``,
      };
    }
    case "computer_list":
      return {
        icon: "folder",
        text: done ? `Listed ${String(args.path ?? "/workspace")}` : "Listing files",
      };
    case "computer_read_file":
      return {
        icon: "file-text",
        text: done ? `Read ${String(args.path ?? "")}` : "Reading a file",
      };
    case "computer_write_file":
      return { icon: "edit-3", text: done ? `Wrote ${String(args.path ?? "")}` : "Writing a file" };
    case "computer_import_file":
      return {
        icon: "download",
        text: done ? `Copied a file to ${String(args.path ?? "")}` : "Copying a file",
      };
    case "computer_export_pdf":
      return { icon: "upload", text: done ? "Saved a PDF to Files" : "Saving a PDF to Files" };
    case "delegate_task":
      return {
        icon: "zap",
        text: done
          ? `Started task · ${String(output.title ?? args.title ?? "")}`
          : "Starting a task",
        href: typeof output.id === "string" ? `/tasks/${output.id}` : undefined,
      };
    case "create_goal":
      return {
        icon: "target",
        text: done ? `Saved goal · ${String(output.title ?? args.title ?? "")}` : "Saving a goal",
        href: typeof output.id === "string" ? `/goals/${output.id}` : undefined,
      };
    case "add_goal_milestones":
      return { icon: "list", text: done ? "Added milestones to the goal" : "Adding milestones" };
    case "goal_status":
      return { icon: "target", text: done ? "Checked your goals" : "Checking your goals" };
    case "watch_page":
      return {
        icon: "eye",
        text: done ? `Watching ${String(output.title ?? host(args.url))}` : "Setting up a watch",
        href: typeof output.id === "string" ? `/watches/${output.id}` : undefined,
      };
    case "finance_summary":
      return {
        icon: "pie-chart",
        text: done ? "Read your spending" : "Reading your spending",
      };
    case "remember_fact":
      return { icon: "bookmark", text: done ? "Saved to memory" : "Saving to memory" };
    case "task_status":
      return { icon: "list", text: done ? "Checked your tasks" : "Checking your tasks" };
    case "recall_memory":
      return { icon: "bookmark", text: done ? "Checked your memories" : "Checking your memories" };
    default:
      if (call.function.name.startsWith("mcp_")) {
        const pending = typeof output.actionId === "string";
        return {
          icon: "box",
          text: done
            ? `${pending ? "Prepared" : "Used"} ${String(output.title ?? call.function.name.replace(/^mcp_/, "").replace(/_/g, " "))}`
            : `Using ${call.function.name.replace(/^mcp_/, "").replace(/_/g, " ")}`,
        };
      }
      return { icon: "tool", text: call.function.name.replace(/_/g, " ") };
  }
}

/** A compact inline row for one tool call: what the agent did, and whether it finished. */
function ToolRow({ call, result }: { call: ToolCall; result?: Result }) {
  const { icon, text, href } = describe(call, result);
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
      {href ? <Icon name="chevron-right" size={15} className="text-zinc-400" /> : null}
    </View>
  );
  if (!href) return row;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(href as never)}
      className="active:opacity-60"
    >
      {row}
    </Pressable>
  );
}

/** The action id a propose_* tool created, so chat can show its approval card. */
function proposalOf(call: ToolCall, result: Result | undefined) {
  if (!call.function.name.startsWith("propose_") && !call.function.name.startsWith("mcp_"))
    return null;
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
  streaming = false,
}: {
  message: ChatMessage;
  /** This reply is still arriving. */
  streaming?: boolean;
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
      {message.content ? <Markdown text={message.content} streaming={streaming} /> : null}
      {message.content && !streaming ? <ReadAloud id={message.id} text={message.content} /> : null}
    </View>
  );
});

/** Read a reply aloud with the device's voice; tap again to stop. */
function ReadAloud({ id, text }: { id: string; text: string }) {
  const [speaking, setSpeaking] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={speaking ? "Stop reading" : "Read aloud"}
      hitSlop={8}
      onPress={() => {
        if (speaking && speakingId() === id) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        setSpeaking(true);
        void speak(text, id).then(() => setSpeaking(false));
      }}
      className="h-7 w-7 items-center justify-center self-start rounded-full opacity-60 active:bg-zinc-100 dark:active:bg-zinc-800"
    >
      <Icon name={speaking ? "square" : "volume-2"} size={14} className="text-zinc-500" />
    </Pressable>
  );
}
