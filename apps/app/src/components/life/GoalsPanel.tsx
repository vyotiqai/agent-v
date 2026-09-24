import type { Goal } from "@agent-v/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../lib/api";
import type { useResource } from "../../lib/resource";
import { Button, Empty, ErrorText, Field, Icon, Label, Muted, Progress } from "../ui";

function GoalRow({ goal }: { goal: Goal }) {
  const done = goal.milestones.filter((m) => m.done).length;
  const next = goal.milestones.find((m) => !m.done);
  return (
    <Pressable
      onPress={() => router.push(`/goals/${goal.id}`)}
      className="gap-2.5 rounded-2xl border border-zinc-200 bg-white p-4 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
            {goal.title}
          </Text>
          <Muted className="text-xs">
            {goal.category}
            {goal.status !== "active" ? ` · ${goal.status}` : ""}
          </Muted>
        </View>
        <Muted className="text-xs">
          {goal.milestones.length ? `${done}/${goal.milestones.length}` : "No plan yet"}
        </Muted>
      </View>
      {goal.milestones.length ? (
        <Progress value={done / goal.milestones.length} label={`${goal.title} progress`} />
      ) : null}
      {next ? (
        <View className="flex-row items-center gap-2">
          <Icon name="circle" size={12} className="text-zinc-300 dark:text-zinc-600" />
          <Text numberOfLines={1} className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">
            Next: {next.title}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function GoalsPanel({ goals }: { goals: ReturnType<typeof useResource<Goal[]>> }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const goal = await api<Goal>("/api/goals", { body: { title: title.trim() } });
      setTitle("");
      router.push(`/goals/${goal.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const list = goals.data ?? [];
  const sections = [
    { title: "Active", items: list.filter((g) => g.status === "active") },
    { title: "Paused", items: list.filter((g) => g.status === "paused") },
    { title: "Completed", items: list.filter((g) => g.status === "completed") },
  ];
  return (
    <View className="gap-5">
      <View className="flex-row items-start gap-2">
        <View className="flex-1">
          <Field
            value={title}
            onChangeText={setTitle}
            placeholder="A new goal, like “Run a half marathon”"
            onSubmitEditing={() => title.trim() && void create()}
            returnKeyType="done"
          />
        </View>
        <Button title="Add" icon="plus" busy={busy} disabled={!title.trim()} onPress={create} />
      </View>
      {error || goals.error ? <ErrorText>{error ?? goals.error}</ErrorText> : null}
      {goals.data?.length === 0 ? (
        <Empty
          icon="target"
          title="No goals yet"
          body="Goals are outcomes you work toward. Add one, and I'll help plan the milestones."
        />
      ) : null}
      {sections.map((section) =>
        section.items.length ? (
          <View key={section.title}>
            <Label>{section.title}</Label>
            <View className="gap-2">
              {section.items.map((goal) => (
                <GoalRow key={goal.id} goal={goal} />
              ))}
            </View>
          </View>
        ) : null,
      )}
    </View>
  );
}
