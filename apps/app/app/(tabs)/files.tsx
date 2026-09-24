import type { FileItem } from "@agent-v/shared";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Empty, ErrorText, Icon, Muted, Title } from "../../src/components/ui";
import { upload } from "../../src/lib/api";
import { useResource } from "../../src/lib/resource";
import { ago } from "../../src/lib/time";

const size = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function Files() {
  const files = useResource<FileItem[]>("/api/files", ["file"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    setBusy(true);
    try {
      const file = await upload<FileItem>(
        "/api/files",
        Platform.OS === "web" && asset.file
          ? asset.file
          : { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/pdf" },
      );
      router.push(`/files/${file.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl gap-4 px-4 pb-10 pt-4">
        <View className="flex-row items-center justify-between">
          <Title>Files</Title>
          <Button
            title="Upload PDF"
            icon="upload"
            variant="secondary"
            busy={busy}
            onPress={() => void pick()}
          />
        </View>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {files.data?.length === 0 ? (
          <Empty
            icon="file-text"
            title="No files yet"
            body="Upload a PDF, save an email attachment, or let a task save one."
          />
        ) : null}
        <View className="gap-2">
          {(files.data ?? []).map((f) => (
            <Pressable
              key={f.id}
              onPress={() => router.push(`/files/${f.id}`)}
              className="flex-row items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950">
                <Icon name="file-text" size={18} className="text-red-500" />
              </View>
              <View className="flex-1 gap-0.5">
                <Text
                  numberOfLines={1}
                  className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100"
                >
                  {f.name}
                </Text>
                <Muted className="text-xs">
                  {f.source} · {size(f.size)}
                  {f.fields.length ? ` · ${f.fields.length} form fields` : ""} · {ago(f.createdAt)}
                </Muted>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
