import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, ConfirmButton, ErrorText, Field, Label, Muted } from "../src/components/ui";
import { downloadExport } from "../src/lib/account";
import { api } from "../src/lib/api";
import { useAuth } from "../src/lib/auth";
import { useMe } from "../src/lib/me";

const deleted = [
  "Chats, tasks, approvals and notifications",
  "Memories, goals, watches, ideas and spending reports",
  "Files, your Linux computer and cloud browser sessions",
  "Connectors, connected accounts and devices",
  "Your subscription (cancelled right away) and the history of your background work",
];

export default function DataScreen() {
  const { signOut } = useAuth();
  // Single-user mode has no password to confirm with; delete the database instead.
  const singleUser = useMe().data?.features.singleUser ?? false;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-6 px-4 pb-12 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      {error ? <ErrorText>{error}</ErrorText> : null}
      <View>
        <Label>Download your data</Label>
        <Card className="gap-3">
          <Muted>
            A ZIP with everything readable: chats, tasks, memories, goals, watches, files and your
            settings, as JSON plus the files themselves. Passwords and access tokens are never
            included.
          </Muted>
          <Button
            title={started ? "Download started" : "Download my data"}
            icon="download"
            variant="secondary"
            busy={busy === "export"}
            onPress={async () => {
              setBusy("export");
              setError(null);
              try {
                await downloadExport();
                setStarted(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(null);
              }
            }}
          />
        </Card>
      </View>

      {singleUser ? null : (
        <View>
          <Label>Delete your account</Label>
          <Card className="gap-4">
            <Muted>This permanently deletes, everywhere it's stored:</Muted>
            <View className="gap-1">
              {deleted.map((line) => (
                <Text key={line} className="text-sm text-zinc-700 dark:text-zinc-300">
                  · {line}
                </Text>
              ))}
            </View>
            <Muted className="text-xs">
              It can't be undone. Download your data first if you want a copy. If you own a team
              with other members, make someone else the owner first.
            </Muted>
            <Field
              label="Your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
            />
            <ConfirmButton
              title="Delete my account"
              confirmTitle="Tap again to delete everything"
              disabled={!password}
              busy={busy === "delete"}
              onConfirm={async () => {
                setBusy("delete");
                setError(null);
                try {
                  await api("/api/account/delete", { body: { password } });
                  await signOut();
                  router.replace("/sign-in");
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(null);
                }
              }}
            />
          </Card>
        </View>
      )}
    </ScrollView>
  );
}
