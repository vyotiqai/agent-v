import type { Connector, ToolPolicy } from "@agent-v/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Button, Card, ErrorText, Label, Muted, Segmented } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { openSignIn, statusDot, statusText } from "../../src/lib/connectors";
import { useResource } from "../../src/lib/resource";
import { ago } from "../../src/lib/time";

export default function ConnectorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useResource<Connector[]>("/api/connectors", ["connector"]);
  const connector = list.data?.find((c) => c.id === id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await list.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!connector)
    return (
      <View className="flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        {list.error ? (
          <ErrorText>{list.error}</ErrorText>
        ) : list.data ? (
          <Muted>Not found</Muted>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  const c = connector;
  const setPolicy = (tool: string, policy: ToolPolicy) =>
    act(`policy:${tool}`, () =>
      api(`/api/connectors/${c.id}`, { method: "PATCH", body: { policies: { [tool]: policy } } }),
    );

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-5 p-4 pb-12"
    >
      <Stack.Screen options={{ title: c.name }} />
      <View className="gap-1">
        <Text className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{c.name}</Text>
        <Muted>{c.url === "demo://tools" ? "Built-in sample tools" : c.url}</Muted>
      </View>
      <Card className="gap-2">
        <View className="flex-row items-center gap-2">
          <View className={`h-2 w-2 rounded-full ${statusDot[c.status]}`} />
          <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
            {statusText[c.status]}
          </Text>
        </View>
        {c.serverName ? <Muted className="text-xs">Server: {c.serverName}</Muted> : null}
        {c.error ? <ErrorText>{c.error}</ErrorText> : null}
        {c.toolsRefreshedAt ? (
          <Muted className="text-xs">Tools checked {ago(c.toolsRefreshedAt)}</Muted>
        ) : null}
        <View className="flex-row flex-wrap gap-2 pt-1">
          {c.auth === "oauth" ? (
            <Button
              title={c.status === "connected" ? "Sign in again" : "Sign in"}
              variant={c.status === "connected" ? "secondary" : "primary"}
              busy={busy === "auth"}
              onPress={() =>
                void act("auth", async () => {
                  const { authorizationUrl } = await api<{ authorizationUrl: string | null }>(
                    `/api/connectors/${c.id}/auth`,
                    { body: {} },
                  );
                  if (authorizationUrl) await openSignIn(authorizationUrl);
                })
              }
            />
          ) : null}
          <Button
            title="Check again"
            variant="secondary"
            icon="refresh-cw"
            busy={busy === "refresh"}
            onPress={() =>
              void act("refresh", () => api(`/api/connectors/${c.id}/refresh`, { body: {} }))
            }
          />
        </View>
      </Card>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {c.tools.length ? (
        <View>
          <Label>Tools</Label>
          <View className="gap-2">
            {c.tools.map((t) => (
              <Card key={t.name} className="gap-2.5">
                <View className="gap-0.5">
                  <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                    {t.title ?? t.name}
                  </Text>
                  {t.description ? <Muted className="text-xs">{t.description}</Muted> : null}
                  <Muted className="text-xs">
                    {t.readOnly
                      ? "Only reads"
                      : t.destructive
                        ? "May delete or overwrite"
                        : "May change things"}
                  </Muted>
                </View>
                <Segmented
                  role="radio"
                  value={t.policy}
                  onChange={(policy) => void setPolicy(t.name, policy)}
                  options={[
                    { value: "auto", label: "Run" },
                    { value: "ask", label: "Ask first" },
                    { value: "off", label: "Off" },
                  ]}
                />
              </Card>
            ))}
          </View>
        </View>
      ) : null}

      <Button
        title={confirmDelete ? "Tap again to remove" : "Remove connector"}
        variant="danger"
        icon="trash-2"
        busy={busy === "delete"}
        onPress={() => {
          if (!confirmDelete) return setConfirmDelete(true);
          setBusy("delete");
          api(`/api/connectors/${c.id}`, { method: "DELETE" })
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
