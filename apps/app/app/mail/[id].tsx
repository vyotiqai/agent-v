import type { Action, FileItem, MailMessage, WorkspaceStatus } from "@agent-v/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ActionCard } from "../../src/components/ActionReview";
import { Button, Card, ErrorText, Field, Icon, Muted } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { useResource } from "../../src/lib/resource";

const emailOf = (from: string) => /<([^>]+)>/.exec(from)?.[1] ?? from.trim();

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const thread = useResource<MailMessage[]>(
    id ? `/api/mail/threads/${encodeURIComponent(id)}` : null,
    ["action"],
  );
  const status = useResource<WorkspaceStatus>("/api/workspace", ["connection"]);
  const [reply, setReply] = useState("");
  const [proposed, setProposed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!thread.data)
    return (
      <View className="flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        {thread.error ? <ErrorText>{thread.error}</ErrorText> : <ActivityIndicator />}
      </View>
    );
  const messages = thread.data;
  const last = [...messages].reverse().find((m) => !m.labels.includes("SENT")) ?? messages.at(-1);

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-3 p-4 pb-12"
    >
      <Stack.Screen options={{ title: messages[0]?.subject || "Email" }} />
      <Text className="px-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {messages[0]?.subject}
      </Text>
      {messages.map((m) => (
        <Card key={m.id} className="gap-2">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                {m.from}
              </Text>
              <Muted className="text-xs">To {m.to.join(", ")}</Muted>
            </View>
            <Muted className="text-xs">{new Date(m.date).toLocaleString()}</Muted>
          </View>
          <Text selectable className="text-[15px] leading-6 text-zinc-800 dark:text-zinc-200">
            {m.body}
          </Text>
          {m.attachments.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              disabled={m.labels.includes("SENT")}
              onPress={() =>
                void run(a.id, async () => {
                  const file = await api<FileItem>("/api/mail/attachments/import", {
                    body: { messageId: m.id, attachmentId: a.id },
                  });
                  router.push(`/files/${file.id}`);
                })
              }
              className="flex-row items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 active:opacity-70 dark:bg-zinc-800"
            >
              {busy === a.id ? (
                <ActivityIndicator size="small" />
              ) : (
                <Icon name="paperclip" size={15} />
              )}
              <Text className="flex-1 text-sm text-zinc-800 dark:text-zinc-200">{a.name}</Text>
              {m.labels.includes("SENT") ? null : <Muted className="text-xs">Open in Files</Muted>}
            </Pressable>
          ))}
        </Card>
      ))}

      {error ? <ErrorText>{error}</ErrorText> : null}
      {proposed ? (
        <ActionCard actionId={proposed} />
      ) : last && status.data?.canWrite ? (
        <Card className="gap-3">
          <Field
            value={reply}
            onChangeText={setReply}
            placeholder={`Reply to ${last.from.replace(/\s*<.*>/, "")}`}
            multiline
            className="min-h-24"
          />
          <Button
            title="Review reply"
            icon="send"
            disabled={!reply.trim()}
            busy={busy === "reply"}
            onPress={() =>
              void run("reply", async () => {
                const action = await api<Action>("/api/actions", {
                  body: {
                    kind: "email.send",
                    payload: {
                      to: [emailOf(last.from)],
                      subject: /^re:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`,
                      body: reply.trim(),
                      replyTo: { threadId: last.threadId, messageId: last.id },
                    },
                  },
                });
                setProposed(action.id);
              })
            }
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}
