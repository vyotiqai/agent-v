import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/lib/auth";

export default function Index() {
  const { status } = useAuth();
  if (status === "loading")
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-zinc-950">
        <ActivityIndicator />
      </View>
    );
  return <Redirect href={status === "signed-in" ? "/chat" : "/sign-in"} />;
}
