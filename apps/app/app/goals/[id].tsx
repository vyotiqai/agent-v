import type { Goal, Milestone, Monitor, Task } from "@agent-v/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Icon,
  IconButton,
  Label,
  Muted,
  Progress,
  Segmented,
  StatusChip,
} from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { watchGoal, watchState } from "../../src/lib/life";
import { useResource } from "../../src/lib/resource";

type Detail = { goal: Goal; tasks: Task[]; monitors: Monitor[] };

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useResource<Detail>(
    id ? `/api/goals/${id}` : null,
    ["goal", "task", "monitor"],
    (event) => event.type !== "goal" || event.id === id,
  );
  const [milestone, setMilestone] = useState("");
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const { goal, tasks, monitors } = detail.data;
  const done = goal.milestones.filter((m) => m.done).length;
  const patch = (body: Record<string, unknown>) =>
    api<Goal>(`/api/goals/${goal.id}`, { method: "PATCH", body });
  const saveMilestones = (list: Milestone[]) =>
    patch({
      milestones: list.map(({ id, title, done }) => ({ id: id || undefined, title, done })),
    });
  const work = (milestoneId?: string) =>
    act(milestoneId ?? "plan", async () => {
      const task = await api<Task>(`/api/goals/${goal.id}/work`, {
        body: milestoneId ? { milestoneId } : {},
      });
      router.push(`/tasks/${task.id}`);
    });

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-5 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: goal.title }} />
      <View className="gap-2">
        <Muted className="text-xs font-medium uppercase tracking-wide">{goal.category}</Muted>
        <Text className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{goal.title}</Text>
        {editing ? (
          <View className="gap-2">
            <Field
              value={description}
              onChangeText={setDescription}
              placeholder="Why it matters, constraints, what done looks like"
              multiline
              className="min-h-20"
            />
            <Button
              title="Save"
              variant="secondary"
              busy={busy === "describe"}
              onPress={() =>
                void act("describe", async () => {
                  await patch({ description });
                  setEditing(false);
                })
              }
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Edit the description"
            onPress={() => {
              setDescription(goal.description);
              setEditing(true);
            }}
          >
            <Muted>{goal.description || "Add a description…"}</Muted>
          </Pressable>
        )}
      </View>

      <Segmented
        role="radio"
        value={goal.status}
        onChange={(status) => void act("status", () => patch({ status }))}
        options={[
          { value: "active", label: "Active" },
          { value: "paused", label: "Paused" },
          { value: "completed", label: "Completed" },
        ]}
      />

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Label>Milestones</Label>
          {goal.milestones.length ? (
            <Muted className="pb-2 text-xs">
              {done} of {goal.milestones.length} done
            </Muted>
          ) : null}
        </View>
        {goal.milestones.length ? (
          <Progress value={done / goal.milestones.length} label="Milestones done" />
        ) : (
          <Card className="gap-3">
            <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
              No plan yet
            </Text>
            <Muted>I can break this goal into concrete milestones in the background.</Muted>
            <Button
              title="Make a plan"
              icon="zap"
              busy={busy === "plan"}
              onPress={() => void work()}
            />
          </Card>
        )}
        <View className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {goal.milestones.map((m, i) => (
            <View
              key={m.id}
              className={`flex-row items-center gap-3 px-3 py-2.5 ${i ? "border-t border-zinc-100 dark:border-zinc-800" : ""}`}
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: m.done }}
                accessibilityLabel={m.title}
                hitSlop={8}
                onPress={() =>
                  void act(`toggle:${m.id}`, () =>
                    saveMilestones(
                      goal.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)),
                    ),
                  )
                }
              >
                <Icon
                  name={m.done ? "check-circle" : "circle"}
                  size={20}
                  className={m.done ? "text-emerald-600" : "text-zinc-300 dark:text-zinc-600"}
                />
              </Pressable>
              <Text
                className={`flex-1 text-[15px] ${m.done ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-100"}`}
              >
                {m.title}
              </Text>
              {m.taskId ? (
                <IconButton
                  name="external-link"
                  label="Open its task"
                  onPress={() => router.push(`/tasks/${m.taskId}`)}
                />
              ) : !m.done ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Do “${m.title}”`}
                  onPress={() => void work(m.id)}
                  disabled={busy === m.id}
                  className="rounded-full bg-zinc-100 px-3 py-1.5 active:opacity-70 dark:bg-zinc-800"
                >
                  <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {busy === m.id ? "Starting…" : "Do it"}
                  </Text>
                </Pressable>
              ) : null}
              <IconButton
                name="x"
                label={`Remove “${m.title}”`}
                onPress={() =>
                  void act(`remove:${m.id}`, () =>
                    saveMilestones(goal.milestones.filter((x) => x.id !== m.id)),
                  )
                }
              />
            </View>
          ))}
          <View
            className={`flex-row items-center gap-2 p-2 ${goal.milestones.length ? "border-t border-zinc-100 dark:border-zinc-800" : ""}`}
          >
            <View className="flex-1">
              <Field
                value={milestone}
                onChangeText={setMilestone}
                placeholder="Add a milestone"
                onSubmitEditing={() =>
                  milestone.trim() &&
                  void act("add", async () => {
                    await saveMilestones([
                      ...goal.milestones,
                      { id: "", title: milestone.trim(), done: false, taskId: null },
                    ]);
                    setMilestone("");
                  })
                }
                returnKeyType="done"
              />
            </View>
            <IconButton
              name="plus"
              label="Add milestone"
              onPress={() =>
                milestone.trim() &&
                void act("add", async () => {
                  await saveMilestones([
                    ...goal.milestones,
                    { id: "", title: milestone.trim(), done: false, taskId: null },
                  ]);
                  setMilestone("");
                })
              }
            />
          </View>
        </View>
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {tasks.length ? (
        <View>
          <Label>Work</Label>
          <View className="gap-2">
            {tasks.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push(`/tasks/${t.id}`)}
                className="flex-row items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <Text
                  numberOfLines={1}
                  className="flex-1 text-[15px] text-zinc-900 dark:text-zinc-100"
                >
                  {t.title}
                </Text>
                <StatusChip status={t.status} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {monitors.length ? (
        <View>
          <Label>Watches</Label>
          <View className="gap-2">
            {monitors.map((w) => (
              <Pressable
                key={w.id}
                onPress={() => router.push(`/watches/${w.id}`)}
                className="gap-0.5 rounded-2xl border border-zinc-200 bg-white p-3.5 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <Text className="text-[15px] text-zinc-900 dark:text-zinc-100">{w.title}</Text>
                <Muted className="text-xs">
                  {watchGoal(w)} · {watchState(w)}
                </Muted>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Button
        title={confirmDelete ? "Tap again to delete this goal" : "Delete goal"}
        variant="danger"
        icon="trash-2"
        busy={busy === "delete"}
        onPress={() => {
          if (!confirmDelete) return setConfirmDelete(true);
          setBusy("delete");
          api(`/api/goals/${goal.id}`, { method: "DELETE" })
            .then(() => router.back())
            .catch((e: Error) => {
              setError(e.message);
              setBusy(null);
            });
        }}
      />
    </ScrollView>
  );
}
