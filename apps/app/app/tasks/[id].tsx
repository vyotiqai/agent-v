import type { TaskDetail } from "@agent-v/shared";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { ActionReview } from "../../src/components/ActionReview";
import { Markdown } from "../../src/components/Markdown";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Icon,
  Label,
  Muted,
  StatusChip,
} from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { useResource } from "../../src/lib/resource";
import { ago } from "../../src/lib/time";

const stepIcon = {
  done: "check-circle",
  active: "loader",
  pending: "circle",
  skipped: "slash",
} as const;

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useResource<TaskDetail>(
    id ? `/api/tasks/${id}` : null,
    ["task", "action"],
    (event) => event.id === id || event.type === "action",
  );
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (label: string, run: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await run();
      await detail.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!detail.data)
    return (
      <View className="flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        {detail.error ? <ErrorText>{detail.error}</ErrorText> : <ActivityIndicator />}
      </View>
    );

  const { task, events, action } = detail.data;
  const active = ["queued", "running", "waiting_input", "waiting_approval"].includes(task.status);

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-5 p-4 pb-12"
    >
      <Stack.Screen options={{ title: task.title }} />
      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <StatusChip status={task.status} />
          <Muted>Updated {ago(task.updatedAt)}</Muted>
        </View>
        <Text className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{task.title}</Text>
        {task.prompt !== task.title ? <Muted>{task.prompt}</Muted> : null}
      </View>

      {task.status === "waiting_input" && task.question ? (
        <Card className="gap-3 border-amber-200 dark:border-amber-900">
          <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
            {task.question}
          </Text>
          <Field value={answer} onChangeText={setAnswer} placeholder="Your answer" multiline />
          <Button
            title="Send answer"
            busy={busy === "answer"}
            disabled={!answer.trim()}
            onPress={() =>
              void act("answer", async () => {
                await api(`/api/tasks/${task.id}/answer`, { body: { answer: answer.trim() } });
                setAnswer("");
              })
            }
          />
        </Card>
      ) : null}

      {action ? <ActionReview action={action} onDecided={() => void detail.reload()} /> : null}

      {task.result ? (
        <Card className="gap-2">
          <Label>Result</Label>
          <Markdown text={task.result} />
        </Card>
      ) : null}
      {task.error ? (
        <Card className="gap-1 border-red-200 dark:border-red-900">
          <Label>Problem</Label>
          <Text className="text-[15px] text-red-700 dark:text-red-300">{task.error}</Text>
        </Card>
      ) : null}

      {task.plan.length ? (
        <View>
          <Label>Plan</Label>
          <Card className="gap-3">
            {task.plan.map((step) => (
              <View key={step.id} className="flex-row items-center gap-3">
                <Icon
                  name={stepIcon[step.status]}
                  size={16}
                  className={
                    step.status === "done"
                      ? "text-emerald-500"
                      : step.status === "active"
                        ? "text-indigo-500"
                        : "text-zinc-300 dark:text-zinc-600"
                  }
                />
                <Text
                  className={`flex-1 text-[15px] ${step.status === "done" ? "text-zinc-500 line-through dark:text-zinc-500" : "text-zinc-800 dark:text-zinc-200"}`}
                >
                  {step.title}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View>
        <Label>Activity</Label>
        <Card className="gap-3">
          {events.map((event) => (
            <View key={event.id} className="gap-0.5">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {event.title}
                </Text>
                <Muted className="text-xs">{ago(event.createdAt)}</Muted>
              </View>
              {event.detail ? (
                <Text numberOfLines={4} className="text-sm text-zinc-500 dark:text-zinc-400">
                  {event.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {active ? (
        <Button
          title="Cancel task"
          variant="danger"
          busy={busy === "cancel"}
          onPress={() =>
            void act("cancel", () =>
              api(`/api/tasks/${task.id}/control`, { body: { action: "cancel" } }),
            )
          }
        />
      ) : task.status === "failed" || task.status === "cancelled" ? (
        <Button
          title={task.status === "failed" ? "Retry from where it failed" : "Resume task"}
          variant="secondary"
          icon="rotate-cw"
          busy={busy === "retry"}
          onPress={() =>
            void act("retry", () =>
              api(`/api/tasks/${task.id}/control`, { body: { action: "retry" } }),
            )
          }
        />
      ) : null}
    </ScrollView>
  );
}
