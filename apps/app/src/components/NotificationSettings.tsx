import {
  type NotificationCategory,
  type NotificationPreferences,
  notificationCategories,
  type PushDevice,
} from "@agent-v/shared";
import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { api } from "../lib/api";
import { enablePush, pushSupported } from "../lib/push";
import { useResource } from "../lib/resource";
import { ago } from "../lib/time";
import { Button, Card, ErrorText, IconButton, Label, Muted } from "./ui";

interface PushStatus {
  webPushKey: string | null;
  preferences: NotificationPreferences;
  devices: PushDevice[];
}

export function NotificationSettings() {
  const status = useResource<PushStatus>("/api/push", ["device", "settings"]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await status.reload();
      if (done) setMessage(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const prefs = status.data?.preferences;
  return (
    <View>
      <Label>Notifications</Label>
      <Card className="gap-3">
        <Muted>Get a push when something needs you or finishes, even when the app is closed.</Muted>
        {notificationCategories
          .filter((c) => c.id !== "ideas")
          .map((category) => (
            <View key={category.id} className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 text-[15px] text-zinc-800 dark:text-zinc-200">
                {category.label}
              </Text>
              <Switch
                accessibilityLabel={category.label}
                value={Boolean(prefs?.[category.id as NotificationCategory])}
                onValueChange={(value) =>
                  void act(category.id, () =>
                    api("/api/push/preferences", {
                      method: "PATCH",
                      body: { [category.id]: value },
                    }),
                  )
                }
              />
            </View>
          ))}
        {(status.data?.devices ?? []).map((d) => (
          <View key={d.id} className="flex-row items-center gap-2">
            <View className="flex-1">
              <Text className="text-[15px] text-zinc-800 dark:text-zinc-200">{d.label}</Text>
              <Muted className="text-xs">
                {d.kind === "expo" ? "Phone" : "Browser"} ·{" "}
                {d.lastUsedAt ? `last push ${ago(d.lastUsedAt)}` : `added ${ago(d.createdAt)}`}
              </Muted>
            </View>
            <IconButton
              name="trash-2"
              label={`Remove ${d.label}`}
              onPress={() =>
                void act("remove", () => api(`/api/push/devices/${d.id}`, { method: "DELETE" }))
              }
            />
          </View>
        ))}
        {pushSupported() ? (
          <View className="flex-row gap-2">
            <Button
              title="Notify this device"
              icon="bell"
              className="flex-1"
              busy={busy === "enable"}
              onPress={() =>
                void act(
                  "enable",
                  () => enablePush(status.data?.webPushKey ?? null),
                  "This device is set up.",
                )
              }
            />
            {status.data?.devices.length ? (
              <Button
                title="Send a test"
                variant="secondary"
                busy={busy === "test"}
                onPress={() => void act("test", () => api("/api/push/test", { body: {} }), "Sent.")}
              />
            ) : null}
          </View>
        ) : (
          <Muted className="text-xs">This device cannot receive push notifications.</Muted>
        )}
        {message ? <Muted>{message}</Muted> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Card>
    </View>
  );
}
