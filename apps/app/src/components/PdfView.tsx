import * as WebBrowser from "expo-web-browser";
import { Text, View } from "react-native";
import { Button, Icon, Muted } from "./ui";

/**
 * On iOS and Android the PDF opens in the system viewer inside the app. An embedded native
 * renderer (expo-pdf) needs a development build and comes with the next release.
 */
export function PdfView({ url, title }: { url: string; title: string }) {
  return (
    <View className="items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <Icon name="file-text" size={32} className="text-zinc-400" />
      <Text
        numberOfLines={2}
        className="text-center text-[15px] font-medium text-zinc-900 dark:text-zinc-100"
      >
        {title}
      </Text>
      <Muted>Opens in the system viewer</Muted>
      <Button
        title="Open PDF"
        icon="external-link"
        onPress={() => void WebBrowser.openBrowserAsync(url)}
      />
    </View>
  );
}
