import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import type { DictationState } from "../lib/dictation";
import { Icon, webInput } from "./ui";

export interface ComposerVoice {
  available: boolean;
  state: DictationState;
  level: number;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

/**
 * One capsule: the draft, and a single button that sends, stops a running reply, or (with an
 * empty draft) dictates.
 */
export function Composer({
  draft,
  onDraft,
  running,
  onSend,
  onStop,
  voice,
}: {
  draft: string;
  onDraft: (text: string) => void;
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  voice?: ComposerVoice;
}) {
  // While a reply streams, a typed message is queued as a follow-up; an empty draft means Stop.
  const canSend = draft.trim().length > 0;
  const stopMode = running && !canSend;
  const micMode = !running && !canSend && Boolean(voice?.available);
  const send = () => {
    if (!canSend) return;
    onSend(draft.trim());
    onDraft("");
  };

  if (voice && voice.state !== "idle")
    return (
      <View className="px-3 pb-3 pt-1">
        <View className="h-12 flex-row items-center gap-3 rounded-[26px] border border-zinc-200 bg-white pl-2 pr-1.5 dark:border-zinc-800 dark:bg-zinc-900">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel voice input"
            onPress={voice.cancel}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-zinc-100 dark:active:bg-zinc-800"
          >
            <Icon name="x" size={18} />
          </Pressable>
          {voice.state === "listening" ? (
            <View className="flex-1 flex-row items-center gap-[3px]" accessibilityLabel="Listening">
              {Array.from({ length: 24 }, (_, i) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
                  key={i}
                  className="w-[3px] rounded-full bg-zinc-900 dark:bg-zinc-100"
                  style={{
                    height:
                      4 + Math.round(voice.level * 22 * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7)))),
                  }}
                />
              ))}
            </View>
          ) : (
            <View className="flex-1 flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="text-sm text-zinc-500">Transcribing…</Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish speaking"
            onPress={voice.stop}
            disabled={voice.state !== "listening"}
            className="h-9 w-9 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-50"
          >
            <Icon name="check" size={16} className="text-white dark:text-zinc-900" />
          </Pressable>
        </View>
      </View>
    );

  return (
    <View className="px-3 pb-3 pt-1">
      <View className="flex-row items-end gap-2 rounded-[26px] border border-zinc-200 bg-white py-1.5 pl-4 pr-1.5 dark:border-zinc-800 dark:bg-zinc-900">
        <TextInput
          value={draft}
          onChangeText={onDraft}
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
          accessibilityLabel={
            micMode ? "Speak" : stopMode ? "Stop" : running ? "Send after this reply" : "Send"
          }
          onPress={micMode ? voice?.start : stopMode ? onStop : send}
          disabled={!micMode && !stopMode && !canSend}
          className={`h-9 w-9 items-center justify-center rounded-full ${stopMode || canSend || micMode ? "bg-zinc-900 dark:bg-zinc-50" : "bg-zinc-200 dark:bg-zinc-800"}`}
        >
          <Icon
            name={micMode ? "mic" : stopMode ? "square" : "arrow-up"}
            size={stopMode ? 14 : micMode ? 17 : 18}
            className={
              stopMode || canSend || micMode ? "text-white dark:text-zinc-900" : "text-zinc-400"
            }
          />
        </Pressable>
      </View>
    </View>
  );
}
