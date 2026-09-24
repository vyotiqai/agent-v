import type { Thread } from "@agent-v/shared";
import { LegendList } from "@legendapp/list/react-native";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Empty, IconButton, Muted } from "../src/components/ui";
import { api } from "../src/lib/api";
import { useResource } from "../src/lib/resource";
import { ago } from "../src/lib/time";

export default function Chats() {
  const threads = useResource<Thread[]>("/api/threads", ["thread"]);
  const [showArchived, setShowArchived] = useState(false);
  const list = (threads.data ?? []).filter((t) => t.archived === showArchived);

  const open = (id: string) => {
    router.dismissTo({ pathname: "/chat", params: { thread: id } });
  };
  const toggleArchive = async (thread: Thread) => {
    await api(`/api/threads/${thread.id}`, {
      method: "PATCH",
      body: { archived: !thread.archived },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950">
      <View className="h-12 flex-row items-center justify-between px-2">
        <IconButton name="x" label="Close" onPress={() => router.back()} />
        <Text className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Chats</Text>
        <IconButton
          name={showArchived ? "inbox" : "archive"}
          label={showArchived ? "Show active chats" : "Show archived chats"}
          onPress={() => setShowArchived(!showArchived)}
        />
      </View>
      {list.length === 0 && !threads.loading ? (
        <Empty
          icon="message-circle"
          title={showArchived ? "No archived chats" : "No chats yet"}
          body={
            showArchived ? "Archived chats appear here." : "Start a conversation from the chat tab."
          }
        />
      ) : (
        <LegendList
          data={list}
          keyExtractor={(t) => t.id}
          estimatedItemSize={64}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item.id)}
              className="flex-row items-center gap-3 px-5 py-3 active:bg-zinc-50 dark:active:bg-zinc-900"
            >
              <View className="flex-1 gap-0.5">
                <Text
                  numberOfLines={1}
                  className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100"
                >
                  {item.title}
                </Text>
                <Muted>{ago(item.updatedAt)}</Muted>
              </View>
              <IconButton
                name={item.archived ? "rotate-ccw" : "archive"}
                label={item.archived ? "Restore" : "Archive"}
                onPress={() => void toggleArchive(item)}
              />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
