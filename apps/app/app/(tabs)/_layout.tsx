import Feather from "@expo/vector-icons/Feather";
import { Redirect, Tabs } from "expo-router";
import { useColorScheme } from "react-native";
import { useAuth } from "../../src/lib/auth";

export default function TabsLayout() {
  const { status } = useAuth();
  const dark = useColorScheme() === "dark";
  if (status === "signed-out") return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? "#fafafa" : "#18181b",
        tabBarInactiveTintColor: "#a1a1aa",
        tabBarStyle: {
          backgroundColor: dark ? "#09090b" : "#ffffff",
          borderTopColor: dark ? "#27272a" : "#f4f4f5",
        },
        sceneStyle: { backgroundColor: dark ? "#09090b" : "#ffffff" },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color }) => <Feather name="check-circle" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color }) => <Feather name="inbox" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: "Files",
          tabBarIcon: ({ color }) => <Feather name="folder" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Feather name="sliders" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
