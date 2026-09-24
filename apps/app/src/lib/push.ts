import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "./api";

// In the foreground the app already shows updates live; don't also pop a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export const pushSupported = () => Device.isDevice;

/** Ask for permission and register this phone with the server. */
export async function enablePush(_webPushKey: string | null) {
  if (!Device.isDevice) throw new Error("Push notifications need a real phone, not a simulator");
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Set an EAS project id (eas init) to receive notifications");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: "Agent V",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Notifications are turned off for Agent V in Settings");
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api("/api/push/devices", {
    body: { kind: "expo", token, label: Device.modelName ?? "Phone" },
  });
}

/** Tapping a notification opens what it is about. */
export function usePushNavigation() {
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const link = response?.notification.request.content.data?.link;
      if (typeof link === "string" && link.startsWith("/")) router.push(link as never);
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);
}
