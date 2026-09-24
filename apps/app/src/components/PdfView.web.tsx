import { createElement } from "react";
import { View } from "react-native";

/** The browser's own PDF viewer, on a signed, short-lived link. */
export function PdfView({ url, title }: { url: string; title: string }) {
  return (
    <View className="h-[70vh] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800">
      {createElement("iframe", {
        src: url,
        title,
        style: { border: 0, width: "100%", height: "100%" },
      })}
    </View>
  );
}
