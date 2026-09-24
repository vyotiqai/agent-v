import type { MonitorCheck, MonitorDetail } from "@agent-v/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Icon,
  type IconName,
  Label,
  Muted,
} from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { every, money, watchGoal, watchState } from "../../src/lib/life";
import { useResource } from "../../src/lib/resource";
import { ago } from "../../src/lib/time";

const outcome: Record<MonitorCheck["outcome"], { icon: IconName; label: string; tone: string }> = {
  baseline: { icon: "flag", label: "Started watching", tone: "text-zinc-500" },
  unchanged: { icon: "minus", label: "No change", tone: "text-zinc-400" },
  changed: { icon: "bell", label: "Changed", tone: "text-emerald-600" },
  matched: { icon: "bell", label: "Condition met", tone: "text-emerald-600" },
  waiting: { icon: "clock", label: "Not yet", tone: "text-zinc-400" },
  error: { icon: "alert-circle", label: "Check failed", tone: "text-red-500" },
};

function DemoPageEditor({ slug }: { slug: string }) {
  const page = useResource<{ text: string }>(`/api/demo-pages/${slug}`, []);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (page.data && text === null) setText(page.data.text);
  }, [page.data, text]);
  if (text === null) return null;
  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-2">
        <Icon name="edit-3" size={15} />
        <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Demo page</Text>
      </View>
      <Muted>This page lives on your server. Change it, then check now to see an alert.</Muted>
      <Field value={text} onChangeText={setText} multiline className="min-h-28" />
      <Button
        title="Save page"
        variant="secondary"
        busy={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await api(`/api/demo-pages/${slug}`, { method: "PUT", body: { text } });
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}

export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useResource<MonitorDetail>(
    id ? `/api/monitors/${id}` : null,
    ["monitor"],
    (event) => event.id === id,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!detail.data)
    return (
      <View className="flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        {detail.error ? <ErrorText>{detail.error}</ErrorText> : <ActivityIndicator />}
      </View>
    );
  const { monitor: w, checks } = detail.data;
  const control = async (action: "pause" | "resume" | "stop" | "check") => {
    setBusy(action);
    setError(null);
    try {
      await api(`/api/monitors/${w.id}/control`, { body: { action } });
      await detail.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy("delete");
    try {
      await api(`/api/monitors/${w.id}`, { method: "DELETE" });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-5 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: w.title }} />
      <View className="gap-1.5">
        <Text className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{w.title}</Text>
        <Text selectable className="text-sm text-zinc-500 dark:text-zinc-400">
          {w.url}
        </Text>
        <Muted>
          {watchGoal(w)} · checked {every(w.intervalMinutes)}
        </Muted>
      </View>

      <Card className="gap-1.5">
        <View className="flex-row items-center gap-2">
          <Icon
            name={w.matched ? "bell" : w.status === "active" ? "eye" : "pause-circle"}
            size={16}
            className={w.matched ? "text-emerald-600" : "text-zinc-500"}
          />
          <Text className="flex-1 text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
            {watchState(w)}
          </Text>
        </View>
        <Muted className="text-xs">
          {w.lastCheckedAt ? `Last checked ${ago(w.lastCheckedAt)}` : "Not checked yet"}
          {w.status === "active" && w.nextCheckAt ? ` · next ${ago(w.nextCheckAt)}` : ""}
          {w.failures ? ` · ${w.failures} failed in a row` : ""}
        </Muted>
      </Card>

      <View className="flex-row flex-wrap gap-2">
        {w.status === "active" ? (
          <>
            <Button
              title="Check now"
              icon="refresh-cw"
              busy={busy === "check"}
              onPress={() => void control("check")}
            />
            <Button
              title="Pause"
              variant="secondary"
              busy={busy === "pause"}
              onPress={() => void control("pause")}
            />
          </>
        ) : w.status === "paused" ? (
          <Button
            title="Resume"
            icon="play"
            busy={busy === "resume"}
            onPress={() => void control("resume")}
          />
        ) : null}
        {w.status !== "stopped" ? (
          <Button
            title="Stop"
            variant="ghost"
            busy={busy === "stop"}
            onPress={() => void control("stop")}
          />
        ) : null}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {w.url.startsWith("demo://") ? <DemoPageEditor slug={w.url.slice(7)} /> : null}

      {w.lastExcerpt ? (
        <View>
          <Label>Page now</Label>
          <Card>
            <Text selectable className="text-sm leading-5 text-zinc-700 dark:text-zinc-300">
              {w.lastExcerpt}
            </Text>
          </Card>
        </View>
      ) : null}

      {checks.length ? (
        <View>
          <Label>History</Label>
          <View className="gap-3 px-1">
            {checks.map((c) => {
              const o = outcome[c.outcome];
              return (
                <View key={c.id} className="flex-row gap-3">
                  <Icon name={o.icon} size={15} className={`mt-0.5 ${o.tone}`} />
                  <View className="flex-1 gap-0.5">
                    <Text className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {o.label}
                      {c.price !== null ? ` · ${money(c.price, w.currency)}` : ""}
                    </Text>
                    {c.outcome !== "unchanged" && c.outcome !== "waiting" ? (
                      <Muted className="text-xs">{c.detail}</Muted>
                    ) : null}
                    <Muted className="text-xs">{ago(c.createdAt)}</Muted>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <Button
        title={confirmDelete ? "Tap again to delete" : "Delete watch"}
        variant="danger"
        icon="trash-2"
        busy={busy === "delete"}
        onPress={() => void remove()}
      />
    </ScrollView>
  );
}
