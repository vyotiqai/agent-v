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
          <Stack.Screen name="browser/[id]" options={{ presentation: "fullScreenModal" }} />
          <Stack.Screen name="computer" options={{ presentation: "fullScreenModal" }} />
          <Stack.Screen
            name="mail/[id]"
            options={{ headerShown: true, title: "Email", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="files/[id]"
            options={{ headerShown: true, title: "File", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="goals/[id]"
            options={{ headerShown: true, title: "Goal", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="watches/[id]"
            options={{ headerShown: true, title: "Watch", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="money/[id]"
            options={{ headerShown: true, title: "Spending", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="tasks/[id]"
            options={{ headerShown: true, title: "Task", headerBackTitle: "Back" }}
          />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
