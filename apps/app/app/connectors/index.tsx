import type { Connector } from "@agent-v/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  Empty,
  ErrorText,
  Field,
  Icon,
  Label,
  Muted,
  Segmented,
} from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { openSignIn, statusDot, statusText } from "../../src/lib/connectors";
import { useMe } from "../../src/lib/me";
import { useResource } from "../../src/lib/resource";

type Created = { connector: Connector; authorizationUrl: string | null };

export default function ConnectorsScreen() {
  const me = useMe();
  const list = useResource<Connector[]>("/api/connectors", ["connector"]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState<"none" | "bearer" | "oauth">("oauth");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const created = await api<Created>("/api/connectors", { body });
      if (created.authorizationUrl) await openSignIn(created.authorizationUrl);
      setName("");
      setUrl("");
      setToken("");
      await list.reload();
      router.push(`/connectors/${created.connector.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const hasSample = (list.data ?? []).some((c) => c.url === "demo://tools");

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-6 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <Muted>
        Connectors are MCP servers. Their tools become your agent's tools, in chat and in background
        tasks. Tools that only read run on their own; anything else asks you first, unless you
        change it.
      </Muted>

      {list.data?.length === 0 ? (
        <Empty icon="box" title="No connectors yet" body="Add an MCP server below." />
      ) : null}
      <View className="gap-2">
        {(list.data ?? []).map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push(`/connectors/${c.id}`)}
            className="flex-row items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <View className={`h-2 w-2 rounded-full ${statusDot[c.status]}`} />
            <View className="flex-1 gap-0.5">
              <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                {c.name}
              </Text>
              <Muted className="text-xs">
                {statusText[c.status]}
                {c.status === "connected"
                  ? ` · ${c.tools.filter((t) => t.policy !== "off").length} tools`
                  : ""}
                {c.url === "demo://tools"
                  ? " · built in"
                  : ` · ${c.url.replace(/^https?:\/\//, "")}`}
              </Muted>
            </View>
            <Icon name="chevron-right" size={16} />
          </Pressable>
        ))}
      </View>

      {me.data?.features.sampleConnector && !hasSample ? (
        <Card className="flex-row items-center gap-3">
          <Icon name="package" size={18} />
          <View className="flex-1">
            <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
              Sample tools
            </Text>
            <Muted className="text-xs">
              Unit conversion, a fictional forecast and a notebook, to try it out.
            </Muted>
          </View>
          <Button
            title="Add"
            variant="secondary"
            busy={busy === "sample"}
            onPress={() => void add({ name: "Samples", url: "demo://tools" }, "sample")}
          />
        </Card>
      ) : null}

      <View>
        <Label>Add a server</Label>
        <Card className="gap-4">
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Linear, GitHub, my tools…"
          />
          <Field
            label="Server URL"
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com/mcp"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <View className="gap-1.5">
            <Text className="px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Access
            </Text>
            <Segmented
              role="radio"
              value={auth}
              onChange={setAuth}
              options={[
                { value: "oauth", label: "Sign in" },
                { value: "bearer", label: "Token" },
                { value: "none", label: "None" },
              ]}
            />
          </View>
          {auth === "bearer" ? (
            <Field
              label="Access token"
              value={token}
              onChangeText={setToken}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Stored encrypted on your server"
            />
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            title={auth === "oauth" ? "Add and sign in" : "Add"}
            icon="plus"
            busy={busy === "add"}
            disabled={!name.trim() || !url.trim() || (auth === "bearer" && !token.trim())}
            onPress={() =>
              void add(
                {
                  name: name.trim(),
                  url: url.trim(),
                  auth,
                  ...(auth === "bearer" ? { token } : {}),
                },
                "add",
              )
            }
          />
          <Muted className="text-xs">
            Uses the MCP Streamable HTTP transport. Sign-in follows the MCP authorization spec
            (OAuth 2.1 with PKCE).
          </Muted>
        </Card>
      </View>
    </ScrollView>
  );
}
