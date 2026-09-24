import { useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { Icon, webInput } from "./ui";

/** One capsule: the draft, and a single button that sends, or stops a running reply. */
export function Composer({
  running,
  onSend,
  onStop,
}: {
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [draft, setDraft] = useState("");
  // While a reply streams, a typed message is queued as a follow-up; an empty draft means Stop.
  const canSend = draft.trim().length > 0;
  const stopMode = running && !canSend;
  const send = () => {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft("");
  };
  return (
    <View className="px-3 pb-3 pt-1">
      <View className="flex-row items-end gap-2 rounded-[26px] border border-zinc-200 bg-white py-1.5 pl-4 pr-1.5 dark:border-zinc-800 dark:bg-zinc-900">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask for anything"
          placeholderTextColor="#a1a1aa"
          multiline
          numberOfLines={1}
          accessibilityLabel="Message"
          className="max-h-40 min-h-9 flex-1 py-2 text-[15px] text-zinc-900 dark:text-zinc-100"
          style={webInput}
          onKeyPress={(e) => {
            // Enter sends on web; Shift+Enter adds a line.
            const native = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
            if (Platform.OS === "web" && native.key === "Enter" && !native.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={stopMode ? "Stop" : running ? "Send after this reply" : "Send"}
          onPress={stopMode ? onStop : send}
          disabled={!stopMode && !canSend}
          className={`h-9 w-9 items-center justify-center rounded-full ${stopMode || canSend ? "bg-zinc-900 dark:bg-zinc-50" : "bg-zinc-200 dark:bg-zinc-800"}`}
        >
          <Icon
            name={stopMode ? "square" : "arrow-up"}
            size={stopMode ? 14 : 18}
            className={stopMode || canSend ? "text-white dark:text-zinc-900" : "text-zinc-400"}
          />
        </Pressable>
      </View>
    </View>
  );
}
