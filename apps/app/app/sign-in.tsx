import { Redirect } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText, Field, Muted } from "../src/components/ui";
import { api } from "../src/lib/api";
import { useAuth } from "../src/lib/auth";

export default function SignIn() {
  const { status, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot">("sign-in");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signed-in") return <Redirect href="/chat" />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        await api("/api/auth/request-password-reset", { body: { email: email.trim() } });
        setSent(true);
      } else if (mode === "sign-up")
        await signUp(name.trim() || email.split("@")[0] || "You", email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-950">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mx-auto w-full max-w-sm gap-8">
            <View className="gap-2">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-50">
                <Text className="text-xl font-bold text-white dark:text-zinc-900">V</Text>
              </View>
              <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {mode === "sign-in"
                  ? "Welcome back"
                  : mode === "sign-up"
                    ? "Create your account"
                    : "Reset your password"}
              </Text>
              <Muted>Your personal agent. Ask for an outcome; it plans, works and checks in.</Muted>
            </View>
            <View className="gap-4">
              {mode === "sign-up" ? (
                <Field
                  label="Name"
                  value={name}
                  onChangeText={setName}
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                />
              ) : null}
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
              />
              {mode === "forgot" ? null : (
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  placeholder="At least 10 characters"
                  onSubmitEditing={submit}
                />
              )}
              {error ? <ErrorText>{error}</ErrorText> : null}
              {mode === "forgot" && sent ? (
                <Muted>
                  If there's an account for {email.trim()}, a link to choose a new password is on
                  its way. It works for one hour.
                </Muted>
              ) : (
                <Button
                  title={
                    mode === "sign-in"
                      ? "Sign in"
                      : mode === "sign-up"
                        ? "Create account"
                        : "Email me a reset link"
                  }
                  onPress={submit}
                  busy={busy}
                  disabled={!email || (mode !== "forgot" && password.length < 10)}
                />
              )}
            </View>
            <View className="items-center gap-1">
              {mode === "sign-in" ? (
                <Pressable onPress={() => setMode("forgot")} className="py-2">
                  <Muted>Forgot your password?</Muted>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                  setSent(false);
                  setError(null);
                }}
                className="py-2"
              >
                <Muted>
                  {mode === "sign-in"
                    ? "New here? Create an account"
                    : mode === "sign-up"
                      ? "Already have an account? Sign in"
                      : "Back to sign in"}
                </Muted>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
