import type { Monitor, MonitorCondition } from "@agent-v/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../lib/api";
import { demoPages, every, intervals, watchGoal, watchState } from "../../lib/life";
import type { useResource } from "../../lib/resource";
import { ago } from "../../lib/time";
import {
  Button,
  Card,
  Choices,
  Empty,
  ErrorText,
  Field,
  Icon,
  Label,
  Muted,
  Segmented,
} from "../ui";

const dot: Record<string, string> = {
  good: "bg-emerald-500",
  active: "bg-indigo-500",
  paused: "bg-amber-500",
  stopped: "bg-zinc-400",
  error: "bg-red-500",
};

function WatchRow({ watch }: { watch: Monitor }) {
  const tone =
    watch.status !== "active"
      ? watch.status
      : watch.error
        ? "error"
        : watch.matched
          ? "good"
          : "active";
  return (
    <Pressable
      onPress={() => router.push(`/watches/${watch.id}`)}
      className="gap-1 rounded-2xl border border-zinc-200 bg-white p-4 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <View className="flex-row items-center gap-2.5">
        <View className={`h-2 w-2 rounded-full ${dot[tone]}`} />
        <Text
          numberOfLines={1}
          className="flex-1 text-[15px] font-medium text-zinc-900 dark:text-zinc-100"
        >
          {watch.title}
        </Text>
        {watch.matched ? <Icon name="bell" size={14} className="text-emerald-600" /> : null}
      </View>
      <Muted>
        {watchGoal(watch)} · {watchState(watch)}
      </Muted>
      <Muted className="text-xs">
        {watch.url.replace(/^https?:\/\//, "")}
        {watch.status === "active" && watch.nextCheckAt ? ` · next ${ago(watch.nextCheckAt)}` : ""}
      </Muted>
    </Pressable>
  );
}

function NewWatch({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [condition, setCondition] = useState<MonitorCondition>("change");
  const [value, setValue] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const watch = await api<Monitor>("/api/monitors", {
        body: {
          title: title.trim() || url.replace(/^https?:\/\//, "").slice(0, 80),
          url: url.trim(),
          condition,
          value: value.trim(),
          intervalMinutes: minutes,
        },
      });
      onDone();
      router.push(`/watches/${watch.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="gap-4">
      <Field
        label="Page"
        value={url}
        onChangeText={setUrl}
        placeholder="https://…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <View className="flex-row flex-wrap gap-2">
        <Muted className="text-xs">Try a demo page:</Muted>
        {demoPages.map((p) => (
          <Pressable
            key={p.url}
            accessibilityRole="button"
            onPress={() => {
              setUrl(p.url);
              if (!title) setTitle(p.label);
            }}
          >
            <Text className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Name"
        value={title}
        onChangeText={setTitle}
        placeholder="What you're watching"
      />
      <View className="gap-1.5">
        <Text className="px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Tell me when
        </Text>
        <Segmented
          role="radio"
          value={condition}
          onChange={setCondition}
          options={[
            { value: "change", label: "It changes" },
            { value: "contains", label: "Text appears" },
            { value: "price_below", label: "Price drops" },
          ]}
        />
      </View>
      {condition !== "change" ? (
        <Field
          label={condition === "contains" ? "Text to look for" : "Below this price"}
          value={value}
          onChangeText={setValue}
          placeholder={condition === "contains" ? "In stock" : "299"}
          keyboardType={condition === "price_below" ? "decimal-pad" : "default"}
        />
      ) : null}
      <Choices label="Check" value={minutes} onChange={setMinutes} options={intervals} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        title="Start watching"
        icon="eye"
        busy={busy}
        disabled={!url.trim() || (condition !== "change" && !value.trim())}
        onPress={save}
      />
      <Muted className="text-xs">
        Only public pages are read. I check {every(minutes)} and notify you once when it happens.
      </Muted>
    </Card>
  );
}

export function WatchesPanel({ watches }: { watches: ReturnType<typeof useResource<Monitor[]>> }) {
  const [adding, setAdding] = useState(false);
  const list = watches.data ?? [];
  const live = list.filter((w) => w.status !== "stopped");
  const stopped = list.filter((w) => w.status === "stopped");
  return (
    <View className="gap-4">
      {adding ? (
        <NewWatch onDone={() => setAdding(false)} />
      ) : (
        <Button title="New watch" icon="plus" variant="secondary" onPress={() => setAdding(true)} />
      )}
      {watches.error ? <ErrorText>{watches.error}</ErrorText> : null}
      {watches.data?.length === 0 && !adding ? (
        <Empty
          icon="eye"
          title="Nothing watched"
          body="Watch a page for changes, for text like “in stock”, or for a price drop."
        />
      ) : null}
      {live.length ? (
        <View className="gap-2">
          {live.map((w) => (
            <WatchRow key={w.id} watch={w} />
          ))}
        </View>
      ) : null}
      {stopped.length ? (
        <View>
          <Label>Stopped</Label>
          <View className="gap-2">
            {stopped.map((w) => (
              <WatchRow key={w.id} watch={w} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
