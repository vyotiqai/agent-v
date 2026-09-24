import type { FileItem } from "@agent-v/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { PdfView } from "../../src/components/PdfView";
import { Button, Card, ErrorText, Field, Label, Muted } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { useResource } from "../../src/lib/resource";

export default function FileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const file = useResource<FileItem>(id ? `/api/files/${id}` : null, ["file"], (e) => e.id === id);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file.data) return;
    setValues(
      Object.fromEntries(
        file.data.fields
          .filter((f) => f.type !== "unsupported")
          .map((f) => [f.name, f.value ?? (f.type === "checkbox" ? false : "")]),
      ),
    );
  }, [file.data]);

  if (!file.data)
    return (
      <View className="flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        {file.error ? <ErrorText>{file.error}</ErrorText> : <ActivityIndicator />}
      </View>
    );
  const f = file.data;
  const fillable = f.fields.filter((field) => field.type !== "unsupported");

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-3xl gap-4 p-4 pb-12"
    >
      <Stack.Screen options={{ title: f.name }} />
      <View className="gap-1 px-1">
        <Text className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{f.name}</Text>
        <Muted>
          {f.source}
          {f.pageCount ? ` · ${f.pageCount} page${f.pageCount > 1 ? "s" : ""}` : ""}
        </Muted>
        {f.parentId ? (
          <Pressable onPress={() => router.push(`/files/${f.parentId}`)}>
            <Text className="text-sm text-indigo-600 dark:text-indigo-400">Open the original</Text>
          </Pressable>
        ) : null}
      </View>
      <PdfView url={f.url} title={f.name} />

      {fillable.length ? (
        <View>
          <Label>Form fields</Label>
          <Card className="gap-4">
            {fillable.map((field) =>
              field.type === "checkbox" ? (
                <View key={field.name} className="flex-row items-center justify-between">
                  <Text className="text-[15px] text-zinc-800 dark:text-zinc-200">{field.name}</Text>
                  <Switch
                    accessibilityLabel={field.name}
                    value={Boolean(values[field.name])}
                    onValueChange={(v) => setValues((current) => ({ ...current, [field.name]: v }))}
                  />
                </View>
              ) : (
                <Field
                  key={field.name}
                  label={field.name}
                  value={String(values[field.name] ?? "")}
                  onChangeText={(v) => setValues((current) => ({ ...current, [field.name]: v }))}
                />
              ),
            )}
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button
              title="Save filled copy"
              busy={busy === "fill"}
              onPress={() =>
                void run("fill", async () => {
                  const filled = await api<FileItem>(`/api/files/${f.id}/fill`, {
                    body: { values },
                  });
                  router.push(`/files/${filled.id}`);
                })
              }
            />
            <Muted className="text-xs">
              The original stays unchanged. Scripts are removed from the copy.
            </Muted>
          </Card>
        </View>
      ) : null}

      <Button
        title="Delete file"
        variant="danger"
        busy={busy === "delete"}
        onPress={() =>
          void run("delete", async () => {
            await api(`/api/files/${f.id}`, { method: "DELETE" });
            router.back();
          })
        }
      />
    </ScrollView>
  );
}
