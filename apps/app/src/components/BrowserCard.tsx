import type { BrowserSession } from "@agent-v/shared";
import { router } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import { useResource } from "../lib/resource";
import { Icon } from "./ui";

/** Inline preview of a chat's cloud browser, with a way to take control of it. */
export function BrowserCard({ sessionId }: { sessionId: string }) {
  const session = useResource<BrowserSession>(
    `/api/browsers/${sessionId}`,
    ["browser"],
    (event) => event.id === sessionId,
  );
  if (!session.data) return null;
  const { title, url, screenshotUrl } = session.data;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open the live browser"
      onPress={() => router.push(`/browser/${sessionId}`)}
      className="mt-1 w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 active:opacity-80 dark:border-zinc-800"
    >
      <Image
        source={{ uri: screenshotUrl }}
        accessibilityIgnoresInvertColors
        className="aspect-[16/10] w-full bg-zinc-100 dark:bg-zinc-900"
        resizeMode="cover"
      />
      <View className="flex-row items-center gap-3 px-3.5 py-2.5">
        <View className="flex-1">
          <Text numberOfLines={1} className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {title || "Browser"}
          </Text>
          <Text numberOfLines={1} className="text-xs text-zinc-500 dark:text-zinc-400">
            {url}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 dark:bg-zinc-50">
          <Icon name="mouse-pointer" size={13} className="text-white dark:text-zinc-900" />
          <Text className="text-xs font-medium text-white dark:text-zinc-900">Take control</Text>
        </View>
      </View>
    </Pressable>
  );
}
