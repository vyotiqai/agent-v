import type { Notification, Task } from "@agent-v/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  Empty,
  ErrorText,
  Field,
  Label,
  Muted,
  StatusChip,
  Title,
} from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { useResource } from "../../src/lib/resource";
import { ago } from "../../src/lib/time";

const groups: { title: string; statuses: Task["status"][] }[] = [
  { title: "Needs you", statuses: ["waiting_input", "waiting_approval"] },
  { title: "In progress", statuses: ["queued", "running"] },
  { title: "Finished", statuses: ["succeeded", "failed", "cancelled"] },
];

function TaskRow({ task }: { task: Task }) {
  const detail = task.question ?? task.error ?? task.result ?? task.prompt;
  return (
    <Pressable
      onPress={() => router.push(`/tasks/${task.id}`)}
      className="gap-1.5 rounded-2xl border border-zinc-200 bg-white p-4 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text
          numberOfLines={2}
          className="flex-1 text-[15px] font-medium text-zinc-900 dark:text-zinc-100"
        >
          {task.title}
        </Text>
        <StatusChip status={task.status} />
      </View>
      <Muted>
        {ago(task.updatedAt)}
        {detail ? ` · ${detail.replace(/\s+/g, " ").slice(0, 120)}` : ""}
      </Muted>
    </Pressable>
  );
}

export default function Tasks() {
  const tasks = useResource<Task[]>("/api/tasks", ["task"]);
  const inbox = useResource<Notification[]>("/api/notifications", ["notification"]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unread = (inbox.data ?? []).filter((n) => !n.readAt).slice(0, 5);

  const delegate = async () => {
    setBusy(true);
    setError(null);
    try {
      const task = await api<Task>("/api/tasks", { body: { prompt: prompt.trim() } });
      setPrompt("");
      router.push(`/tasks/${task.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openNotification = async (n: Notification) => {
    await api("/api/notifications/read", { body: { id: n.id } }).catch(() => {});
    if (n.taskId) router.push(`/tasks/${n.taskId}`);
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl gap-6 px-4 pb-10 pt-4">
        <Title>Tasks</Title>
        <View className="gap-2">
          <Field
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Delegate something: research, plan, prepare…"
            multiline
            className="min-h-20"
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            title="Start task"
            icon="zap"
            onPress={delegate}
            busy={busy}
            disabled={!prompt.trim()}
          />
        </View>

        {unread.length ? (
          <View>
            <View className="flex-row items-center justify-between">
              <Label>Updates</Label>
              <Pressable onPress={() => void api("/api/notifications/read", { body: {} })}>
                <Muted className="pb-2">Mark all read</Muted>
              </Pressable>
            </View>
            <View className="gap-2">
              {unread.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => void openNotification(n)}
                  className="gap-0.5 rounded-2xl bg-indigo-50 p-4 active:opacity-70 dark:bg-indigo-950"
                >
                  <Text className="text-[15px] font-medium text-indigo-900 dark:text-indigo-100">
                    {n.title}
                  </Text>
                  <Text
                    numberOfLines={2}
                    className="text-sm text-indigo-800/80 dark:text-indigo-200/80"
                  >
                    {n.body}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {tasks.data?.length === 0 ? (
          <Empty
            icon="check-circle"
            title="No tasks yet"
            body="Delegate something above, or ask in chat."
          />
        ) : null}
        {groups.map((group) => {
          const items = (tasks.data ?? []).filter((t) => group.statuses.includes(t.status));
          if (!items.length) return null;
          return (
            <View key={group.title}>
              <Label>{group.title}</Label>
              <View className="gap-2">
                {items.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
