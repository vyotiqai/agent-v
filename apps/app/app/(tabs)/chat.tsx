import type { ChatMessage, Thread } from "@agent-v/shared";
import { LegendList } from "@legendapp/list/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Composer } from "../../src/components/Composer";
import { browserSessionOf, browserTools, MessageView } from "../../src/components/Messages";
import { ErrorText, IconButton } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { useChat } from "../../src/lib/chat";
import { useDictation } from "../../src/lib/dictation";
import { useMe } from "../../src/lib/me";
import { speak, stopSpeaking } from "../../src/lib/speech";

const suggestions = [
  "Plan a weekend trip to Lisbon",
  "Summarize https://example.com",
  "Remember that I prefer window seats",
];

type Result = Extract<ChatMessage, { role: "tool" }>;

export default function ChatScreen() {
  const params = useLocalSearchParams<{ thread?: string }>();
  const [threadId, setThreadId] = useState<string | null>(params.thread ?? null);
  useEffect(() => setThreadId(params.thread ?? null), [params.thread]);
  const chat = useChat(threadId);

  const { visible, results, liveCallId } = useMemo(() => {
    const results = new Map<string, Result>();
    const visible: ChatMessage[] = [];
    for (const m of chat.messages) {
      if (m.role === "tool") results.set(m.toolCallId, m);
      else visible.push(m);
    }
    let liveCallId: string | null = null;
    for (const m of visible)
      if (m.role === "assistant")
        for (const call of m.toolCalls ?? [])
          if (browserTools.has(call.function.name) && browserSessionOf(results.get(call.id)))
            liveCallId = call.id;
    return { visible, results, liveCallId };
  }, [chat.messages]);

  const send = useCallback(
    async (text: string) => {
      let id = threadId;
      if (!id) {
        const thread = await api<Thread>("/api/threads", { body: {} });
        id = thread.id;
        setThreadId(id);
        router.setParams({ thread: id });
      }
      chat.send(id, text);
    },
    [threadId, chat.send],
  );

  // Voice: the mic dictates into the draft; voice mode listens, sends, reads the reply aloud,
  // and listens again until it is turned off.
  const me = useMe();
  const [draft, setDraft] = useState("");
  const [voiceMode, setVoiceMode] = useState<"off" | "listening" | "thinking" | "speaking">("off");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mode = useRef(voiceMode);
  mode.current = voiceMode;
  const dictation = useDictation({
    serverTranscription: Boolean(me.data?.features.transcription),
    onText: (text) => {
      if (mode.current === "off") setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text));
      else {
        setVoiceMode("thinking");
        void send(text);
      }
    },
    onError: (message) => {
      setVoiceError(message);
      setVoiceMode("off");
    },
  });
  const listen = useCallback(() => {
    setVoiceError(null);
    setVoiceMode("listening");
    void dictation.start({ autoStop: true });
  }, [dictation.start]);
  const endVoice = () => {
    setVoiceMode("off");
    stopSpeaking();
    void dictation.cancel();
  };
  // A reply finished while in voice mode: read it, then listen again.
  const lastReply = [...visible].reverse().find((m) => m.role === "assistant" && m.content);
  useEffect(() => {
    if (voiceMode !== "thinking" || chat.running) return;
    const text = lastReply?.role === "assistant" ? (lastReply.content ?? "") : "";
    setVoiceMode("speaking");
    void speak(text).then(() => {
      if (mode.current === "speaking") listen();
    });
  }, [voiceMode, chat.running, lastReply, listen]);
  // A dictation that ends without words (silence, cancel) leaves voice mode.
  useEffect(() => {
    if (voiceMode === "listening" && dictation.state === "idle") {
      const timer = setTimeout(() => {
        if (mode.current === "listening") setVoiceMode("off");
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [voiceMode, dictation.state]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-zinc-950">
      <View className="h-12 flex-row items-center justify-between px-2">
        <IconButton name="menu" label="Chats" onPress={() => router.push("/chats")} />
        <Text className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Agent V</Text>
        <View className="flex-row">
          {dictation.available ? (
            <IconButton
              name={voiceMode === "off" ? "headphones" : "mic-off"}
              label={voiceMode === "off" ? "Voice mode" : "End voice mode"}
              onPress={voiceMode === "off" ? listen : endVoice}
            />
          ) : null}
          <IconButton
            name="terminal"
            label="Linux computer"
            onPress={() => router.push("/computer")}
          />
          <IconButton
            name="edit"
            label="New chat"
            onPress={() => {
              setThreadId(null);
              router.setParams({ thread: undefined });
            }}
          />
        </View>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 49 : 0}
        className="flex-1"
      >
        {visible.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-6 px-6">
            <Text className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              What can I take off your plate?
            </Text>
            <View className="w-full max-w-md gap-2">
              {suggestions.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => void send(s)}
                  className="rounded-2xl border border-zinc-200 px-4 py-3 active:bg-zinc-50 dark:border-zinc-800 dark:active:bg-zinc-900"
                >
                  <Text className="text-[15px] text-zinc-700 dark:text-zinc-300">{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <LegendList
            data={visible}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageView
                message={item}
                results={results}
                liveCallId={liveCallId}
                streaming={chat.running && item.id === lastReply?.id}
              />
            )}
            extraData={`${results.size}:${liveCallId}:${chat.running}`}
            estimatedItemSize={72}
            alignItemsAtEnd
            initialScrollAtEnd
            maintainScrollAtEnd
            maintainVisibleContentPosition
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: 12 }}
            keyboardShouldPersistTaps="handled"
          />
        )}
        {chat.queued.length ? (
          <View className="w-full max-w-[760px] gap-1 self-center px-4 pb-1">
            {chat.queued.map((q) => (
              <Text key={q.id} numberOfLines={1} className="text-right text-sm text-zinc-400">
                Up next · {q.content}
              </Text>
            ))}
          </View>
        ) : null}
        {chat.error || voiceError ? (
          <View className="w-full max-w-[760px] flex-row items-center gap-3 self-center px-5 pb-1">
            <View className="flex-1">
              <ErrorText>{chat.error ?? voiceError}</ErrorText>
            </View>
            {chat.limited ? (
              <Pressable accessibilityRole="link" onPress={() => router.push("/plan")} hitSlop={8}>
                <Text className="text-sm font-medium text-zinc-900 underline dark:text-zinc-100">
                  See plans
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {voiceMode === "thinking" || voiceMode === "speaking" ? (
          <View className="w-full max-w-[760px] flex-row items-center justify-between self-center px-5 pb-1">
            <Text className="text-sm text-zinc-500">
              {voiceMode === "thinking" ? "Thinking…" : "Speaking… tap to interrupt"}
            </Text>
            <Pressable accessibilityRole="button" onPress={endVoice} hitSlop={8}>
              <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                End voice
              </Text>
            </Pressable>
          </View>
        ) : null}
        <View className="w-full max-w-[760px] self-center">
          <Composer
            draft={draft}
            onDraft={setDraft}
            running={chat.running}
            onSend={(t) => void send(t)}
            onStop={chat.stop}
            voice={{
              available: dictation.available,
              state: dictation.state,
              level: dictation.level,
              start: () => {
                setVoiceError(null);
                stopSpeaking();
                void dictation.start();
              },
              stop: () => void dictation.stop(),
              cancel: () => {
                if (mode.current !== "off") endVoice();
                else void dictation.cancel();
              },
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
