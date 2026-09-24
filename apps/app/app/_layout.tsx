import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="chats" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="tasks/[id]"
            options={{ headerShown: true, title: "Task", headerBackTitle: "Back" }}
          />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
