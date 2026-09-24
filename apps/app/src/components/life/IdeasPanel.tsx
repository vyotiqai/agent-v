import type { Evidence, Idea, Task } from "@agent-v/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../lib/api";
import type { useResource } from "../../lib/resource";
import { ago } from "../../lib/time";
import { Button, Card, Empty, ErrorText, Field, Icon, type IconName, Muted } from "../ui";

const kindIcon: Record<Idea["kind"], IconName> = {
  paperwork: "file-text",
  reply: "mail",
  event: "calendar",
  plan: "target",
  watch: "eye",
  finance: "pie-chart",
};
const evidenceIcon: Record<Evidence["kind"], IconName> = {
  mail: "mail",
  event: "calendar",
  goal: "target",
  task: "check-circle",
  monitor: "eye",
  finance: "pie-chart",
};

function evidenceLink(e: Evidence) {
  if (e.kind === "mail") return `/mail/${encodeURIComponent(e.id)}`;
  if (e.kind === "goal") return `/goals/${e.id}`;
  if (e.kind === "monitor") return `/watches/${e.id}`;
  if (e.kind === "finance") return `/money/${e.id}`;
  if (e.kind === "task") return `/tasks/${e.id}`;
  return null;
}

function EvidenceRow({ evidence }: { evidence: Evidence }) {
  const href = evidenceLink(evidence);
  const body = (
    <View className="flex-row items-start gap-2.5 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-950">
      <Icon name={evidenceIcon[evidence.kind]} size={14} className="mt-0.5 text-zinc-400" />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {evidence.title}
        </Text>
        {evidence.excerpt || (evidence.kind === "event" && evidence.date) ? (
          <Muted className="text-xs">
            {[
              evidence.kind === "event" && evidence.date
                ? new Date(evidence.date).toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "",
              evidence.excerpt,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Muted>
        ) : null}
      </View>
    </View>
  );
  return href ? (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(href as never)}
      className="active:opacity-70"
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}

function IdeaCard({ idea }: { idea: Idea }) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(idea.prompt);
  const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (action: "accept" | "dismiss") => {
    setBusy(action);
    setError(null);
    try {
      const result = await api<{ task?: Task }>(`/api/ideas/${idea.id}/decide`, {
        body: { action, ...(action === "accept" && prompt !== idea.prompt ? { prompt } : {}) },
      });
      if (result.task) router.push(`/tasks/${result.task.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="gap-3">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950">
          <Icon
            name={kindIcon[idea.kind]}
            size={16}
            className="text-indigo-600 dark:text-indigo-300"
          />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
            {idea.title}
          </Text>
          <Muted>{idea.reason}</Muted>
        </View>
      </View>
      {idea.evidence.length ? (
        <View className="gap-1.5">
          {idea.evidence.map((e) => (
            <EvidenceRow key={`${e.kind}:${e.id}:${e.title}`} evidence={e} />
          ))}
        </View>
      ) : null}
      {editing ? (
        <Field
          label="What I'll do"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          className="min-h-24"
        />
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {idea.status === "accepted" && idea.taskId ? (
        <Button
          title="Open task"
          variant="secondary"
          icon="arrow-right"
          onPress={() => router.push(`/tasks/${idea.taskId}`)}
        />
      ) : (
        <View className="flex-row gap-2">
          <Button
            title="Do it"
            icon="zap"
            className="flex-1"
            busy={busy === "accept"}
            disabled={!prompt.trim()}
            onPress={() => void decide("accept")}
          />
          <Button
            title={editing ? "Done" : "Edit"}
            variant="secondary"
            onPress={() => setEditing(!editing)}
          />
          <Button
            title="Dismiss"
            variant="ghost"
            busy={busy === "dismiss"}
            onPress={() => void decide("dismiss")}
          />
        </View>
      )}
    </Card>
  );
}

export function IdeasPanel({ ideas }: { ideas: ReturnType<typeof useResource<Idea[]>> }) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      ideas.setData(await api<Idea[]>("/api/ideas/refresh", { body: {} }));
    } finally {
      setRefreshing(false);
    }
  };
  const open = (ideas.data ?? []).filter((i) => i.status === "new");
  const started = (ideas.data ?? []).filter((i) => i.status === "accepted");
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between px-1">
        <Muted>Suggestions from your mail, calendar, goals and spending.</Muted>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Look for new ideas"
          onPress={() => void refresh()}
          hitSlop={8}
          className={refreshing ? "opacity-40" : ""}
          disabled={refreshing}
        >
          <Icon name="refresh-cw" size={16} />
        </Pressable>
      </View>
      {ideas.error ? <ErrorText>{ideas.error}</ErrorText> : null}
      {ideas.data && !open.length ? (
        <Empty
          icon="sun"
          title="Nothing needs you"
          body="New ideas appear when mail, calendar or goals call for them."
        />
      ) : null}
      {open.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} />
      ))}
      {started.length ? (
        <View className="gap-2 pt-2">
          <Muted className="px-1 text-xs font-medium uppercase tracking-wide">Started</Muted>
          {started.map((idea) => (
            <Pressable
              key={idea.id}
              onPress={() => idea.taskId && router.push(`/tasks/${idea.taskId}`)}
              className="flex-row items-center gap-3 rounded-2xl px-1 py-2 active:opacity-70"
            >
              <Icon name={kindIcon[idea.kind]} size={15} />
              <Text numberOfLines={1} className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                {idea.title}
              </Text>
              <Muted className="text-xs">{ago(idea.createdAt)}</Muted>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
