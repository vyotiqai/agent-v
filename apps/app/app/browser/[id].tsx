import type { FileItem } from "@agent-v/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  type GestureResponderEvent,
  Image,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton, webInput } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { type Frame, useLiveBrowser } from "../../src/lib/live-browser";

/**
 * Shows the newest frame without flicker: the next image loads hidden underneath and only
 * replaces the visible one once decoded.
 */
function FrameView({ frame }: { frame: Frame }) {
  const [shown, setShown] = useState(frame.uri);
  return (
    <View className="absolute inset-0">
      <Image
        source={{ uri: shown }}
        className="absolute inset-0"
        resizeMode="stretch"
        fadeDuration={0}
      />
      {frame.uri !== shown ? (
        <Image
          source={{ uri: frame.uri }}
          className="absolute inset-0 opacity-0"
          resizeMode="stretch"
          fadeDuration={0}
          onLoad={() => setShown(frame.uri)}
        />
      ) : null}
    </View>
  );
}

export default function BrowserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const live = useLiveBrowser(id ?? "");
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [area, setArea] = useState({ width: 0, height: 0 });
  const lastWheel = useRef(0);
  const surface = useRef<View>(null);

  useEffect(() => {
    if (!editing) setAddress(live.page.url);
  }, [live.page.url, editing]);

  const frameWidth = live.frame?.width ?? 1280;
  const frameHeight = live.frame?.height ?? 800;
  // Fit the page inside the available area (like object-fit: contain).
  const ratio = frameWidth / frameHeight;
  const width = Math.max(0, Math.min(area.width, area.height * ratio, frameWidth));
  const scale = width ? frameWidth / width : 1;

  /** Page coordinates of a tap. React Native reports locationX/Y; on web we measure the element. */
  const tapPoint = (event: GestureResponderEvent) => {
    const e = event.nativeEvent as Partial<{
      locationX: number;
      locationY: number;
      clientX: number;
      clientY: number;
      pageX: number;
      pageY: number;
    }>;
    let x = e.locationX;
    let y = e.locationY;
    if ((x == null || y == null) && Platform.OS === "web" && surface.current) {
      const rect = (surface.current as unknown as HTMLElement).getBoundingClientRect();
      x = (e.clientX ?? e.pageX ?? 0) - rect.left;
      y = (e.clientY ?? e.pageY ?? 0) - rect.top;
    }
    if (x == null || y == null) return null;
    return { x: Math.round(x * scale), y: Math.round(y * scale) };
  };

  const go = () => {
    const value = address.trim();
    if (!value) return;
    live.send({ type: "navigate", url: /^https?:\/\//i.test(value) ? value : `https://${value}` });
    setEditing(false);
  };

  const wheel =
    Platform.OS === "web"
      ? {
          onWheel: (event: { deltaY: number; preventDefault(): void }) => {
            event.preventDefault();
            const now = Date.now();
            if (now - lastWheel.current < 50) return;
            lastWheel.current = now;
            live.send({ type: "scroll", dy: Math.max(-800, Math.min(800, event.deltaY * 2)) });
          },
        }
      : {};

  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <View className="flex-row items-center gap-1 px-2 py-1.5">
        <IconButton
          name="x"
          label="Close"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/chat"))}
        />
        <IconButton name="arrow-left" label="Back" onPress={() => live.send({ type: "back" })} />
        <IconButton
          name="arrow-right"
          label="Forward"
          onPress={() => live.send({ type: "forward" })}
        />
        <TextInput
          value={address}
          onChangeText={setAddress}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onSubmitEditing={go}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          selectTextOnFocus
          accessibilityLabel="Address"
          placeholder="Enter an address"
          placeholderTextColor="#a1a1aa"
          className="h-10 flex-1 rounded-full bg-white px-4 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
          style={webInput}
        />
        <IconButton name="rotate-cw" label="Reload" onPress={() => live.send({ type: "reload" })} />
      </View>

      <View
        className="flex-1 items-center justify-center overflow-hidden px-2"
        onLayout={(e: LayoutChangeEvent) =>
          setArea({
            width: e.nativeEvent.layout.width - 16,
            height: e.nativeEvent.layout.height,
          })
        }
      >
        <View
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800"
          style={{ width, height: width / ratio }}
          {...wheel}
        >
          {live.frame ? <FrameView frame={live.frame} /> : null}
          <Pressable
            ref={surface}
            accessibilityLabel="Page. Tap to click."
            className="absolute inset-0"
            onPress={(e) => {
              const point = tapPoint(e);
              if (point) live.send({ type: "click", ...point });
            }}
          />
          {!live.frame ? (
            <View className="absolute inset-0 items-center justify-center gap-2">
              <ActivityIndicator />
              <Text className="text-sm text-zinc-500">Connecting to the browser…</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className="w-full max-w-[1280px] gap-2 self-center px-3 pb-3 pt-2">
        <View className="flex-row items-center justify-between px-1">
          <View className="flex-row items-center gap-2">
            <View
              className={`h-2 w-2 rounded-full ${live.status === "live" ? "bg-emerald-500" : live.status === "connecting" ? "bg-amber-400" : "bg-zinc-400"}`}
            />
            <Text numberOfLines={1} className="text-xs text-zinc-500 dark:text-zinc-400">
              {live.status === "live"
                ? `You're in control · ${live.page.title || "page"}`
                : live.status === "connecting"
                  ? "Connecting…"
                  : "Reconnecting…"}
            </Text>
          </View>
          <View className="flex-row">
            <IconButton
              name="chevrons-up"
              label="Scroll up"
              onPress={() => live.send({ type: "scroll", dy: -600 })}
            />
            <IconButton
              name="chevrons-down"
              label="Scroll down"
              onPress={() => live.send({ type: "scroll", dy: 600 })}
            />
          </View>
        </View>
        {live.error ? (
          <Text className="px-1 text-sm text-red-600 dark:text-red-400">{live.error}</Text>
        ) : null}
        {live.downloads.length ? (
          <View className="flex-row items-center gap-3 rounded-2xl bg-indigo-50 px-4 py-2.5 dark:bg-indigo-950">
            <Text numberOfLines={1} className="flex-1 text-sm text-indigo-900 dark:text-indigo-100">
              Downloaded {live.downloads.join(", ")}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void api<FileItem[]>(`/api/browsers/${id}/downloads/import`, { body: {} }).then(
                  (saved) => {
                    live.clearDownloads();
                    if (saved[0]) router.push(`/files/${saved[0].id}`);
                  },
                )
              }
            >
              <Text className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                Save to Files
              </Text>
            </Pressable>
          </View>
        ) : null}
        <View className="flex-row items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-4 pr-1 dark:border-zinc-800 dark:bg-zinc-900">
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => {
              if (text) live.send({ type: "type", text });
              live.send({ type: "key", key: "Enter" });
              setText("");
            }}
            placeholder="Type into the page, Enter to submit"
            placeholderTextColor="#a1a1aa"
            accessibilityLabel="Type into the page"
            className="h-9 flex-1 text-sm text-zinc-900 dark:text-zinc-100"
            style={webInput}
          />
          <IconButton
            name="corner-down-left"
            label="Send text"
            onPress={() => {
              if (text) live.send({ type: "type", text });
              setText("");
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
