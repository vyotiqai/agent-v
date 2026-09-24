import * as Speech from "expo-speech";

/** Markdown read aloud: code and links become words, symbols disappear. */
export function speakable(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " (code omitted) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~|]+/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

let current: string | null = null;

/** Read text aloud on the device (on the web, the browser's voices). Resolves when finished. */
export function speak(markdown: string, id = "reply"): Promise<void> {
  Speech.stop();
  current = id;
  const text = speakable(markdown).slice(0, 4000);
  return new Promise((resolve) => {
    if (!text) return resolve();
    Speech.speak(text, {
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export function stopSpeaking() {
  current = null;
  Speech.stop();
}

export const speakingId = () => current;
