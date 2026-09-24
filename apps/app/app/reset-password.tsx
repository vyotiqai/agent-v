import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText, Field, Muted } from "../src/components/ui";
import { api } from "../src/lib/api";

/** Where the password-reset email lands: choose a new password. */
export default function ResetPassword() {
  const { token, error: linkError } = useLocalSearchParams<{ token?: string; error?: string }>();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const invalid = Boolean(linkError) || !token;

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950">
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="mx-auto w-full max-w-sm gap-6">
          <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {done ? "Password changed" : "Choose a new password"}
          </Text>
          {done ? (
            <>
              <Muted>You're signed out everywhere. Sign in with your new password.</Muted>
              <Button title="Sign in" onPress={() => router.replace("/sign-in")} />
            </>
          ) : invalid ? (
            <>
              <Muted>This link has expired or was already used. Ask for a new one.</Muted>
              <Button title="Back to sign in" onPress={() => router.replace("/sign-in")} />
            </>
          ) : (
            <View className="gap-4">
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 10 characters"
              />
              <Field
                label="Again"
                value={again}
                onChangeText={setAgain}
                secureTextEntry
                autoComplete="new-password"
              />
              {password && again && password !== again ? (
                <ErrorText>The passwords don't match</ErrorText>
              ) : null}
              {error ? <ErrorText>{error}</ErrorText> : null}
              <Button
                title="Change password"
                busy={busy}
                disabled={password.length < 10 || password !== again}
                onPress={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api("/api/auth/reset-password", {
                      body: { token, newPassword: password },
                    });
                    setDone(true);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
