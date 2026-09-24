import { Redirect } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText, Field, Muted } from "../src/components/ui";
import { useAuth } from "../src/lib/auth";

export default function SignIn() {
  const { status, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
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
      if (mode === "sign-up")
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
                {mode === "sign-in" ? "Welcome back" : "Create your account"}
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
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                placeholder="At least 10 characters"
                onSubmitEditing={submit}
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              <Button
                title={mode === "sign-in" ? "Sign in" : "Create account"}
                onPress={submit}
                busy={busy}
                disabled={!email || password.length < 10}
              />
            </View>
            <Pressable
              onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
              className="items-center py-2"
            >
              <Muted>
                {mode === "sign-in"
                  ? "New here? Create an account"
                  : "Already have an account? Sign in"}
              </Muted>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
