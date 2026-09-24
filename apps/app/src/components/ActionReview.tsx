import type { Action } from "@agent-v/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../lib/api";
import { useResource } from "../lib/resource";
import { ago } from "../lib/time";
import { Button, Card, ErrorText, Icon, Muted } from "./ui";

type Payload = Record<string, unknown>;
const list = (value: unknown) => (Array.isArray(value) ? value.map(String).join(", ") : "");

function when(value: unknown, allDay: unknown) {
  const text = String(value ?? "");
  if (allDay || text.length === 10) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
}

/** A readable preview of exactly what will happen. */
function Preview({ action }: { action: Action }) {
  const p = action.payload as Payload;
  if (action.kind === "email.send")
    return (
      <View className="gap-1.5 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
        <Row label="From" value={String(p.account ?? "")} />
        <Row label="To" value={list(p.to)} />
        {list(p.cc) ? <Row label="Cc" value={list(p.cc)} /> : null}
        <Row label="Subject" value={String(p.subject ?? "")} />
        <Text selectable className="pt-1 text-[15px] leading-6 text-zinc-800 dark:text-zinc-200">
          {String(p.body ?? "")}
        </Text>
        {Array.isArray(p.attachmentIds) && p.attachmentIds.length ? (
          <View className="flex-row items-center gap-1.5 pt-1">
            <Icon name="paperclip" size={14} />
            <Muted>
              {p.attachmentIds.length} attachment{p.attachmentIds.length > 1 ? "s" : ""}
            </Muted>
          </View>
        ) : null}
      </View>
    );
  if (action.kind === "calendar.create" || action.kind === "calendar.delete")
    return (
      <View className="gap-1.5 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
        <Row label="Calendar" value={String(p.account ?? "")} />
        <Row label="Event" value={String(p.title ?? "")} />
        {p.start ? <Row label="Starts" value={when(p.start, p.allDay)} /> : null}
        {p.end ? <Row label="Ends" value={when(p.end, p.allDay)} /> : null}
        {p.location ? <Row label="Where" value={String(p.location)} /> : null}
      </View>
    );
  if (action.kind === "mcp.call")
    return (
      <View className="gap-1.5 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
        <Row label="Connector" value={String(p.connector ?? "")} />
        <Row label="Tool" value={String(p.tool ?? "")} />
        <Text selectable className="pt-1 font-mono text-xs text-zinc-700 dark:text-zinc-300">
          {JSON.stringify(p.arguments ?? {}, null, 2)}
        </Text>
      </View>
    );
  return (
    <View className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
      <Text selectable className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
        {JSON.stringify(action.payload, null, 2)}
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="w-16 text-sm text-zinc-500 dark:text-zinc-400">{label}</Text>
      <Text selectable className="flex-1 text-sm text-zinc-900 dark:text-zinc-100">
        {value}
      </Text>
    </View>
  );
}

const outcome: Record<
  string,
  { icon: "check-circle" | "x-circle" | "alert-triangle" | "clock"; text: string; tone: string }
> = {
  succeeded: { icon: "check-circle", text: "Done", tone: "text-emerald-600" },
  denied: { icon: "x-circle", text: "Declined; nothing was sent", tone: "text-zinc-500" },
  failed: { icon: "x-circle", text: "Failed", tone: "text-red-600" },
  expired: { icon: "clock", text: "Expired; nothing was sent", tone: "text-zinc-500" },
  outcome_unknown: {
    icon: "alert-triangle",
    text: "Unclear whether it went through; check before retrying",
    tone: "text-amber-600",
  },
  approved: { icon: "clock", text: "Approved; running", tone: "text-indigo-600" },
  executing: { icon: "clock", text: "Running", tone: "text-indigo-600" },
};

/** Review and approve or decline one action. Approval quotes the exact version shown. */
export function ActionReview({ action, onDecided }: { action: Action; onDecided?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: "approve" | "deny") => {
    setBusy(decision);
    setError(null);
    try {
      await api(`/api/actions/${action.id}/decide`, { body: { hash: action.hash, decision } });
      onDecided?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const done = outcome[action.status];
  return (
    <Card
      className={`gap-3 ${action.status === "awaiting_review" ? "border-amber-200 dark:border-amber-900" : ""}`}
    >
      <View className="flex-row items-center gap-2">
        <Icon name="shield" size={16} className="text-amber-600" />
        <Text className="flex-1 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
          {action.title}
        </Text>
      </View>
      <Preview action={action} />
      {action.status === "awaiting_review" ? (
        <>
          <Muted>Expires {ago(action.expiresAt)}. Nothing happens unless you approve.</Muted>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <View className="flex-row gap-2">
            <Button
              title="Approve"
              className="flex-1"
              busy={busy === "approve"}
              onPress={() => void decide("approve")}
            />
            <Button
              title="Decline"
              variant="secondary"
              className="flex-1"
              busy={busy === "deny"}
              onPress={() => void decide("deny")}
            />
          </View>
        </>
      ) : done ? (
        <View className="flex-row items-center gap-2">
          <Icon name={done.icon} size={15} className={done.tone} />
          <Text className={`flex-1 text-sm ${done.tone}`}>
            {done.text}
            {action.result ? ` · ${action.result}` : action.error ? ` · ${action.error}` : ""}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/** Loads an action by id and keeps it live (used for proposals made in chat). */
export function ActionCard({ actionId }: { actionId: string }) {
  const action = useResource<Action>(
    `/api/actions/${actionId}`,
    ["action"],
    (e) => e.id === actionId,
  );
  if (!action.data) return null;
  return (
    <View className="mt-1 w-full max-w-md">
      <ActionReview action={action.data} onDecided={() => void action.reload()} />
    </View>
  );
}
