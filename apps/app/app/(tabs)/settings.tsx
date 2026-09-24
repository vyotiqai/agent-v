import type {
  BrowserSession,
  Memory,
  Settings,
  TeamInfo,
  Usage,
  WorkspaceStatus,
} from "@agent-v/shared";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NotificationSettings } from "../../src/components/NotificationSettings";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Icon,
  IconButton,
  Label,
  Muted,
  NavRow,
  Title,
} from "../../src/components/ui";
import { compact } from "../../src/lib/account";
import { API_URL, api } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { useMe } from "../../src/lib/me";
import { useResource } from "../../src/lib/resource";

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { verified } = useLocalSearchParams<{ verified?: string }>();
  const me = useMe();
  const usage = useResource<Usage>("/api/usage", ["usage"]);
  const team = useResource<TeamInfo>("/api/team", ["team"]);
  const [verifySent, setVerifySent] = useState(false);
  const memories = useResource<Memory[]>("/api/memories", ["memory"]);
  const browsers = useResource<BrowserSession[]>(
    me.data?.features.browser ? "/api/browsers" : null,
    ["browser"],
  );
  const [address, setAddress] = useState("");
  const workspace = useResource<WorkspaceStatus>("/api/workspace", ["connection"]);
  const connectGoogle = (capability: "read" | "write") =>
    run(async () => {
      const { url } = await api<{ url: string }>("/api/google/connect", { body: { capability } });
      // The result arrives over the live stream when Google redirects back.
      await WebBrowser.openBrowserAsync(url);
    });
  const [name, setName] = useState("");
  const [tone, setTone] = useState("");
  const [memory, setMemory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me.data) return;
    setName(me.data.settings.agentName);
    setTone(me.data.settings.tone);
  }, [me.data]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = (patch: Partial<Settings>) =>
    run(async () => {
      await api("/api/settings", { method: "PATCH", body: patch });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl gap-6 px-4 pb-12 pt-4">
        <Title>Settings</Title>
        {error ? <ErrorText>{error}</ErrorText> : null}

        <View>
          <Label>Plan and account</Label>
          <Card className="gap-1 p-2">
            <NavRow
              icon="bar-chart-2"
              title="Plan and usage"
              detail={
                usage.data
                  ? `${usage.data.plan.name} · ${compact(usage.data.used.tokens)}${usage.data.plan.limits.tokens !== null ? ` of ${compact(usage.data.plan.limits.tokens)}` : ""} AI tokens this month`
                  : undefined
              }
              onPress={() => router.push("/plan")}
            />
            <NavRow
              icon="users"
              title="Team"
              detail={
                team.data?.team
                  ? `${team.data.team.name} · ${team.data.members.length} ${team.data.members.length === 1 ? "member" : "members"}`
                  : team.data?.received.length
                    ? "You have an invitation"
                    : "Share a plan with others"
              }
              onPress={() => router.push("/team")}
            />
            <NavRow
              icon="download"
              title="Your data"
              detail="Download everything, or delete your account"
              onPress={() => router.push("/data")}
            />
            {me.data?.features.admin ? (
              <NavRow
                icon="shield"
                title="Admin"
                detail="Accounts, plans and suspensions"
                onPress={() => router.push("/admin")}
              />
            ) : null}
          </Card>
        </View>

        <View>
          <Label>Model</Label>
          <Card className="gap-1 p-2">
            {(me.data?.models ?? []).map((model) => {
              const selected = model.id === me.data?.settings.model;
              return (
                <Pressable
                  key={model.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => void save({ model: model.id })}
                  className="flex-row items-center justify-between rounded-xl px-3 py-3 active:bg-zinc-50 dark:active:bg-zinc-800"
                >
                  <Text className="text-[15px] text-zinc-900 dark:text-zinc-100">
                    {model.label}
                  </Text>
                  {selected ? (
                    <Icon name="check" size={18} className="text-indigo-600 dark:text-indigo-400" />
                  ) : null}
                </Pressable>
              );
            })}
          </Card>
          <Muted className="px-1 pt-2">
            Add providers on the server: OpenAI, Anthropic, Google or any OpenAI-compatible
            endpoint.
          </Muted>
        </View>

        <View>
          <Label>Personality</Label>
          <Card className="gap-4">
            <Field label="Agent name" value={name} onChangeText={setName} />
            <Field
              label="Tone"
              value={tone}
              onChangeText={setTone}
              placeholder="warm and concise"
            />
            <Button
              title={saved ? "Saved" : "Save"}
              variant="secondary"
              onPress={() => void save({ agentName: name.trim(), tone: tone.trim() })}
              disabled={!name.trim() || !tone.trim()}
            />
          </Card>
        </View>

        <View>
          <Label>Memory</Label>
          <Card className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[15px] text-zinc-800 dark:text-zinc-200">
                  Learn from conversations
                </Text>
                <Muted className="text-xs">
                  Saves lasting facts you mention, like preferences. You can delete any of them.
                </Muted>
              </View>
              <Switch
                accessibilityLabel="Learn from conversations"
                value={me.data?.settings.learnMemories ?? true}
                onValueChange={(learnMemories) => void save({ learnMemories })}
              />
            </View>
            {(memories.data ?? []).map((m) => (
              <View key={m.id} className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Text className="text-[15px] text-zinc-800 dark:text-zinc-200">{m.text}</Text>
                  <Muted className="text-xs">
                    {m.origin === "manual" ? m.source : `Learned from ${m.origin}`}
                  </Muted>
                </View>
                <IconButton
                  name="trash-2"
                  label="Forget"
                  onPress={() => void run(() => api(`/api/memories/${m.id}`, { method: "DELETE" }))}
                />
              </View>
            ))}
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <Field
                  value={memory}
                  onChangeText={setMemory}
                  placeholder="Add something to remember"
                />
              </View>
              <IconButton
                name="plus"
                label="Add memory"
                onPress={() =>
                  void run(async () => {
                    if (!memory.trim()) return;
                    await api("/api/memories", { body: { text: memory.trim() } });
                    setMemory("");
                  })
                }
              />
            </View>
          </Card>
        </View>

        <NotificationSettings />

        <View>
          <Label>Connectors</Label>
          <Pressable onPress={() => router.push("/connectors")}>
            <Card className="flex-row items-center gap-3">
              <Icon name="box" size={18} />
              <View className="flex-1">
                <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                  MCP servers
                </Text>
                <Muted className="text-xs">
                  Give your agent tools from any MCP server. You decide which tools ask first.
                </Muted>
              </View>
              <Icon name="chevron-right" size={16} />
            </Card>
          </Pressable>
        </View>

        {me.data?.features.computer ? (
          <View>
            <Label>Linux computer</Label>
            <Pressable onPress={() => router.push("/computer")}>
              <Card className="flex-row items-center gap-3">
                <Icon name="terminal" size={18} />
                <View className="flex-1">
                  <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                    Open terminal and files
                  </Text>
                  <Muted className="text-xs">
                    A private container with no network. Only /workspace is kept.
                  </Muted>
                </View>
                <Icon name="chevron-right" size={16} />
              </Card>
            </Pressable>
          </View>
        ) : null}

        <View>
          <Label>Accounts</Label>
          <Card className="gap-3">
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <Icon name="mail" size={16} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                  Gmail and Calendar
                </Text>
                <Muted className="text-xs">
                  {workspace.data?.source === "google"
                    ? `${workspace.data.account} · ${workspace.data.canWrite ? "read and send (with your approval)" : "read only"}`
                    : workspace.data?.source === "demo"
                      ? "Using a demo mailbox with fictional mail"
                      : "Not connected"}
                </Muted>
              </View>
            </View>
            {workspace.data?.googleAvailable ? (
              workspace.data.source === "google" ? (
                <View className="flex-row gap-2">
                  {!workspace.data.canWrite ? (
                    <Button
                      title="Allow sending"
                      variant="secondary"
                      className="flex-1"
                      onPress={() => void connectGoogle("write")}
                    />
                  ) : null}
                  <Button
                    title="Disconnect"
                    variant="danger"
                    className="flex-1"
                    onPress={() => void run(() => api("/api/google/disconnect", { body: {} }))}
                  />
                </View>
              ) : (
                <View className="flex-row gap-2">
                  <Button
                    title="Connect Google"
                    className="flex-1"
                    onPress={() => void connectGoogle("read")}
                  />
                  <Button
                    title="With sending"
                    variant="secondary"
                    className="flex-1"
                    onPress={() => void connectGoogle("write")}
                  />
                </View>
              )
            ) : (
              <Muted className="text-xs">
                To use your real Gmail and Calendar, the server needs GOOGLE_CLIENT_ID,
                GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY.
              </Muted>
            )}
            <Muted className="text-xs">
              Emails and calendar changes always wait for your approval.
            </Muted>
          </Card>
        </View>

        {me.data?.features.browser ? (
          <View>
            <Label>Cloud browser</Label>
            <Card className="gap-3">
              <Muted>
                A real browser that runs on your server. Your agent uses it to read sites, and you
                can take control for logins or forms. Logins stay in each session until you delete
                it.
              </Muted>
              {(browsers.data ?? []).map((b) => (
                <View key={b.id} className="flex-row items-center gap-2">
                  <Pressable className="flex-1" onPress={() => router.push(`/browser/${b.id}`)}>
                    <Text
                      numberOfLines={1}
                      className="text-[15px] text-zinc-800 dark:text-zinc-200"
                    >
                      {b.title || b.url || "Blank page"}
                    </Text>
                    <Muted className="text-xs">
                      {b.threadId ? "From a chat" : b.taskId ? "From a task" : "Opened by you"} ·{" "}
                      {b.url.replace(/^https?:\/\//, "").slice(0, 60)}
                    </Muted>
                  </Pressable>
                  <IconButton
                    name="trash-2"
                    label="Delete session"
                    onPress={() =>
                      void run(() => api(`/api/browsers/${b.id}`, { method: "DELETE" }))
                    }
                  />
                </View>
              ))}
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Field
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Open an address, e.g. news.ycombinator.com"
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
                <IconButton
                  name="external-link"
                  label="Open browser"
                  onPress={() =>
                    void run(async () => {
                      const value = address.trim();
                      if (!value) return;
                      const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
                      const session = await api<BrowserSession>("/api/browsers", { body: { url } });
                      setAddress("");
                      router.push(`/browser/${session.id}`);
                    })
                  }
                />
              </View>
            </Card>
          </View>
        ) : null}

        <View>
          <Label>Account</Label>
          <Card className="gap-3">
            {me.data ? (
              <View>
                <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                  {me.data.user.name}
                </Text>
                <Muted>{me.data.user.email}</Muted>
              </View>
            ) : null}
            {verified ? (
              <Muted className="text-xs">Your email is confirmed.</Muted>
            ) : me.data?.features.email && !me.data.user.emailVerified ? (
              <View className="flex-row items-center gap-3">
                <Muted className="flex-1 text-xs">
                  {verifySent
                    ? "Check your inbox for the confirmation link."
                    : "Confirm your email to join teams and reset your password."}
                </Muted>
                {verifySent ? null : (
                  <Button
                    title="Send link"
                    variant="secondary"
                    onPress={() =>
                      void run(async () => {
                        await api("/api/auth/send-verification-email", {
                          body: { email: me.data?.user.email },
                        });
                        setVerifySent(true);
                      })
                    }
                  />
                )}
              </View>
            ) : null}
            <Muted className="text-xs">Server: {API_URL}</Muted>
            <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
