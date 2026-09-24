import type { CalendarEvent, MailSummary, WorkspaceStatus } from "@agent-v/shared";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Empty, ErrorText, Field, Icon, Label, Muted, Title } from "../../src/components/ui";
import { useResource } from "../../src/lib/resource";
import { ago } from "../../src/lib/time";

const sender = (from: string) => from.replace(/\s*<.*>/, "").replace(/"/g, "") || from;

function Segmented({
  value,
  onChange,
}: {
  value: "mail" | "calendar";
  onChange: (v: "mail" | "calendar") => void;
}) {
  return (
    <View className="flex-row rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
      {(["mail", "calendar"] as const).map((option) => (
        <Pressable
          key={option}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option }}
          onPress={() => onChange(option)}
          className={`flex-1 items-center rounded-full py-2 ${value === option ? "bg-white dark:bg-zinc-800" : ""}`}
        >
          <Text
            className={`text-sm font-medium ${value === option ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}
          >
            {option === "mail" ? "Mail" : "Calendar"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MailList() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const mail = useResource<MailSummary[]>(`/api/mail?q=${encodeURIComponent(debounced)}`, [
    "connection",
    "action",
  ]);
  return (
    <View className="gap-3">
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Search mail"
        autoCapitalize="none"
      />
      {mail.error ? <ErrorText>{mail.error}</ErrorText> : null}
      {mail.data?.length === 0 ? (
        <Empty icon="inbox" title="No mail" body="Nothing matches that search." />
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {(mail.data ?? []).map((m, i) => (
          <Pressable
            key={m.id}
            onPress={() => router.push(`/mail/${encodeURIComponent(m.threadId)}`)}
            className={`gap-0.5 px-4 py-3 active:bg-zinc-50 dark:active:bg-zinc-800 ${i ? "border-t border-zinc-100 dark:border-zinc-800" : ""}`}
          >
            <View className="flex-row items-center gap-2">
              <Text
                numberOfLines={1}
                className="flex-1 text-[15px] font-medium text-zinc-900 dark:text-zinc-100"
              >
                {m.labels.includes("SENT") ? `To ${m.to.join(", ")}` : sender(m.from)}
              </Text>
              {m.attachments.length ? <Icon name="paperclip" size={13} /> : null}
              <Muted className="text-xs">{ago(m.date)}</Muted>
            </View>
            <Text numberOfLines={1} className="text-sm text-zinc-800 dark:text-zinc-200">
              {m.subject || "(no subject)"}
            </Text>
            <Muted className="text-xs">{m.snippet.slice(0, 120)}</Muted>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function dayLabel(event: CalendarEvent) {
  const date = new Date(event.allDay ? `${event.start}T00:00:00` : event.start);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function CalendarList() {
  const events = useResource<CalendarEvent[]>("/api/calendar/events", ["connection", "action"]);
  const days = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of events.data ?? []) {
      const key = dayLabel(event);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return [...groups.entries()];
  }, [events.data]);
  return (
    <View className="gap-5">
      {events.error ? <ErrorText>{events.error}</ErrorText> : null}
      {events.data?.length === 0 ? (
        <Empty icon="calendar" title="Nothing scheduled" body="Your next three weeks are clear." />
      ) : null}
      {days.map(([day, list]) => (
        <View key={day}>
          <Label>{day}</Label>
          <View className="gap-2">
            {list.map((e) => (
              <View
                key={e.id}
                className="flex-row gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <View className="w-1 rounded-full bg-indigo-500" />
                <View className="flex-1 gap-0.5">
                  <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                    {e.title}
                  </Text>
                  <Muted>
                    {e.allDay
                      ? "All day"
                      : `${new Date(e.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} – ${new Date(e.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
                    {e.location ? ` · ${e.location}` : ""}
                  </Muted>
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function Inbox() {
  const [tab, setTab] = useState<"mail" | "calendar">("mail");
  const status = useResource<WorkspaceStatus>("/api/workspace", ["connection"]);
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-2xl gap-4 px-4 pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-end justify-between">
          <Title>Inbox</Title>
          {status.data ? (
            <Pressable onPress={() => router.push("/settings")}>
              <Muted>
                {status.data.source === "demo"
                  ? "Demo mailbox"
                  : (status.data.account ?? "Not connected")}
              </Muted>
            </Pressable>
          ) : null}
        </View>
        <Segmented value={tab} onChange={setTab} />
        {status.data?.source === "none" ? (
          <Empty
            icon="link"
            title="Connect Google"
            body="Connect your Google account in Settings to see mail and calendar."
          />
        ) : tab === "mail" ? (
          <MailList />
        ) : (
          <CalendarList />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
