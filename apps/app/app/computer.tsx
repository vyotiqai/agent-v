import type { ComputerCommand, ComputerEntry, ComputerStatus, FileItem } from "@agent-v/shared";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Empty, ErrorText, Icon, IconButton, Muted, webInput } from "../src/components/ui";
import { api } from "../src/lib/api";
import { useResource } from "../src/lib/resource";

const mono = "font-mono text-[13px] leading-5";
const stateLabel = {
  running: "Running",
  stopped: "Stopped",
  absent: "Not created yet",
  unavailable: "Unavailable",
};
const stateDot = {
  running: "bg-emerald-500",
  stopped: "bg-zinc-400",
  absent: "bg-zinc-300",
  unavailable: "bg-red-400",
};

function Receipt({ c }: { c: ComputerCommand }) {
  const tone =
    c.status === "succeeded"
      ? "text-emerald-400"
      : c.status === "running"
        ? "text-indigo-300"
        : "text-amber-300";
  return (
    <View className="gap-1 border-b border-zinc-800 px-4 py-3">
      <Text selectable className={`${mono} text-zinc-100`}>
        <Text className="text-zinc-500">
          {c.cwd === "/workspace" ? "~" : c.cwd.replace("/workspace", "~")} ${" "}
        </Text>
        {c.command}
      </Text>
      {c.stdout ? (
        <Text selectable className={`${mono} text-zinc-300`}>
          {c.stdout.replace(/\n$/, "")}
        </Text>
      ) : null}
      {c.stderr ? (
        <Text selectable className={`${mono} text-red-300`}>
          {c.stderr.replace(/\n$/, "")}
        </Text>
      ) : null}
      <Text className={`text-xs ${tone}`}>
        {c.status === "running"
          ? "Running…"
          : c.status === "timed_out"
            ? "Stopped: time limit reached"
            : c.status === "interrupted"
              ? "Interrupted; not run again"
              : `Exit ${c.exitCode ?? "?"}`}
        {c.truncated ? " · output shortened" : ""}
        {c.taskId ? " · from a task" : ""}
      </Text>
    </View>
  );
}

function Terminal({
  status,
  onError,
}: {
  status: ComputerStatus;
  onError: (m: string | null) => void;
}) {
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("/workspace");
  const scroll = useRef<ScrollView>(null);
  const runningNow = status.commands.some((c) => c.status === "running");
  const commands = [...status.commands].reverse();
  // Keep the newest output in view, like a terminal.
  const newest = `${commands.at(-1)?.id}:${commands.at(-1)?.status}`;
  useEffect(() => {
    if (newest !== "undefined:undefined")
      setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50);
  }, [newest]);

  const submit = async () => {
    const value = command.trim();
    if (!value) return;
    setCommand("");
    onError(null);
    try {
      await api("/api/computer/commands", { body: { command: value, cwd } });
    } catch (e) {
      onError((e as Error).message);
      setCommand(value);
    }
  };

  return (
    <View className="flex-1 overflow-hidden rounded-2xl bg-zinc-950">
      <ScrollView ref={scroll} className="flex-1" contentContainerClassName="pb-2">
        {commands.length ? (
          commands.map((c) => <Receipt key={c.id} c={c} />)
        ) : (
          <Text className={`${mono} p-4 text-zinc-500`}>
            Your private Linux computer. Try: ls -la, python3 --version, git init
          </Text>
        )}
      </ScrollView>
      <View className="flex-row items-center gap-2 border-t border-zinc-800 px-3 py-2">
        <TextInput
          value={cwd}
          onChangeText={setCwd}
          accessibilityLabel="Working folder"
          autoCapitalize="none"
          autoCorrect={false}
          className={`${mono} w-28 text-zinc-400`}
          style={webInput}
        />
        <Text className={`${mono} text-emerald-400`}>$</Text>
        <TextInput
          value={command}
          onChangeText={setCommand}
          onSubmitEditing={() => void submit()}
          placeholder="Type a command"
          placeholderTextColor="#52525b"
          accessibilityLabel="Command"
          autoCapitalize="none"
          autoCorrect={false}
          className={`${mono} h-9 flex-1 text-zinc-100`}
          style={webInput}
        />
        {runningNow ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void api("/api/computer/cancel", { body: {} })}
          >
            <Text className="text-sm font-medium text-red-400">Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Run"
            onPress={() => void submit()}
          >
            <Icon name="corner-down-left" size={18} className="text-zinc-300" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function FilesPanel({ onError }: { onError: (m: string | null) => void }) {
  const [path, setPath] = useState("/workspace");
  const [open, setOpen] = useState<{ path: string; text: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [picking, setPicking] = useState(false);
  const listing = useResource<{ entries: ComputerEntry[] }>(
    `/api/computer/files?path=${encodeURIComponent(path)}`,
    ["computer"],
  );
  const files = useResource<FileItem[]>(picking ? "/api/files" : null, ["file"]);
  const act = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
      await listing.reload();
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const child = (n: string) => `${path.replace(/\/$/, "")}/${n}`;

  if (open)
    return (
      <View className="flex-1 gap-3">
        <View className="flex-row items-center gap-2">
          <IconButton name="arrow-left" label="Back to folder" onPress={() => setOpen(null)} />
          <Text numberOfLines={1} className={`${mono} flex-1 text-zinc-700 dark:text-zinc-300`}>
            {open.path}
          </Text>
          <Button
            title="Save"
            variant="secondary"
            disabled={draft === open.text}
            onPress={() =>
              void act(async () => {
                await api("/api/computer/file", {
                  method: "PUT",
                  body: { path: open.path, text: draft },
                });
                setOpen({ ...open, text: draft });
              })
            }
          />
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          accessibilityLabel="File contents"
          autoCapitalize="none"
          autoCorrect={false}
          className={`${mono} flex-1 rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100`}
          style={[webInput, { textAlignVertical: "top" }]}
        />
      </View>
    );

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-3 pb-8">
      <View className="flex-row items-center gap-2">
        {path !== "/workspace" ? (
          <IconButton
            name="arrow-up"
            label="Up one folder"
            onPress={() => setPath(path.replace(/\/[^/]+$/, "") || "/workspace")}
          />
        ) : null}
        <Text numberOfLines={1} className={`${mono} flex-1 text-zinc-700 dark:text-zinc-300`}>
          {path}
        </Text>
        <IconButton
          name="download"
          label="Copy a PDF from Files"
          onPress={() => setPicking(!picking)}
        />
      </View>
      {picking ? (
        <View className="gap-1 rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
          <Muted className="px-2 py-1 text-xs">Copy into {path}</Muted>
          {(files.data ?? []).map((f) => (
            <Pressable
              key={f.id}
              onPress={() =>
                void act(async () => {
                  await api("/api/computer/import", {
                    body: { fileId: f.id, path: child(f.name) },
                  });
                  setPicking(false);
                })
              }
              className="rounded-xl px-3 py-2 active:bg-zinc-100 dark:active:bg-zinc-800"
            >
              <Text className="text-sm text-zinc-800 dark:text-zinc-200">{f.name}</Text>
            </Pressable>
          ))}
          {files.data?.length === 0 ? <Muted className="px-2 py-1">No files yet.</Muted> : null}
        </View>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {(listing.data?.entries ?? []).map((e, i) => (
          <Pressable
            key={e.name}
            onPress={() =>
              e.kind === "dir"
                ? setPath(child(e.name))
                : e.kind === "file" && !/\.pdf$/i.test(e.name)
                  ? void act(async () => {
                      const file = await api<{ path: string; text: string }>(
                        `/api/computer/file?path=${encodeURIComponent(child(e.name))}`,
                      );
                      setOpen(file);
                      setDraft(file.text);
                    })
                  : undefined
            }
            className={`flex-row items-center gap-3 px-4 py-3 active:bg-zinc-50 dark:active:bg-zinc-800 ${i ? "border-t border-zinc-100 dark:border-zinc-800" : ""}`}
          >
            <Icon
              name={e.kind === "dir" ? "folder" : e.kind === "link" ? "link" : "file"}
              size={16}
            />
            <Text numberOfLines={1} className="flex-1 text-[15px] text-zinc-800 dark:text-zinc-200">
              {e.name}
            </Text>
            {/\.pdf$/i.test(e.name) && e.kind === "file" ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  void act(async () => {
                    const file = await api<FileItem>("/api/computer/export", {
                      body: { path: child(e.name) },
                    });
                    router.push(`/files/${file.id}`);
                  })
                }
              >
                <Text className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  Save to Files
                </Text>
              </Pressable>
            ) : (
              <Muted className="text-xs">
                {e.kind === "dir" ? "" : `${Math.max(1, Math.round(e.size / 1024))} KB`}
              </Muted>
            )}
            <IconButton
              name="trash-2"
              label={`Delete ${e.name}`}
              onPress={() =>
                void act(() =>
                  api(`/api/computer/file?path=${encodeURIComponent(child(e.name))}`, {
                    method: "DELETE",
                  }),
                )
              }
            />
          </Pressable>
        ))}
        {listing.data?.entries.length === 0 ? (
          <Muted className="p-4">This folder is empty.</Muted>
        ) : null}
      </View>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="New file or folder/ name"
            placeholderTextColor="#a1a1aa"
            accessibilityLabel="New name"
            autoCapitalize="none"
            className="h-11 rounded-xl border border-zinc-200 bg-white px-3.5 text-[15px] text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            style={webInput}
          />
        </View>
        <Button
          title="Create"
          variant="secondary"
          disabled={!name.trim()}
          onPress={() =>
            void act(async () => {
              const clean = name.trim();
              if (clean.endsWith("/"))
                await api("/api/computer/folders", { body: { path: child(clean.slice(0, -1)) } });
              else
                await api("/api/computer/file", {
                  method: "PUT",
                  body: { path: child(clean), text: "" },
                });
              setName("");
            })
          }
        />
      </View>
    </ScrollView>
  );
}

export default function ComputerScreen() {
  const status = useResource<ComputerStatus>("/api/computer", ["computer"]);
  const [tab, setTab] = useState<"terminal" | "files">("terminal");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);

  const control = async (action: "start" | "stop" | "erase") => {
    setBusy(action);
    setError(null);
    try {
      await api(`/api/computer/${action}`, { body: {} });
      await status.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setConfirmErase(false);
    }
  };

  const s = status.data;
  return (
    <SafeAreaView className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <View className="mx-auto w-full max-w-4xl flex-1 gap-3 px-3 pb-3">
        <View className="h-12 flex-row items-center gap-2">
          <IconButton
            name="x"
            label="Close"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/chat"))}
          />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              Linux computer
            </Text>
            {s ? (
              <View className="flex-row items-center gap-1.5">
                <View className={`h-2 w-2 rounded-full ${stateDot[s.state]}`} />
                <Muted className="text-xs">
                  {stateLabel[s.state]} · no network
                  {s.limits ? ` · ${s.limits.memoryMb} MB · ${s.limits.cpus} CPU` : ""}
                </Muted>
              </View>
            ) : null}
          </View>
          {s?.available ? (
            <>
              {s.state === "running" ? (
                <Button
                  title="Stop"
                  variant="secondary"
                  busy={busy === "stop"}
                  onPress={() => void control("stop")}
                />
              ) : (
                <Button
                  title="Start"
                  busy={busy === "start"}
                  onPress={() => void control("start")}
                />
              )}
              <Button
                title={confirmErase ? "Tap to erase" : "Erase"}
                variant="danger"
                busy={busy === "erase"}
                onPress={() => (confirmErase ? void control("erase") : setConfirmErase(true))}
              />
            </>
          ) : null}
        </View>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {!s ? (
          <ActivityIndicator />
        ) : !s.available ? (
          <Empty
            icon="terminal"
            title="Not enabled on this server"
            body="Set COMPUTER_PROVIDER=docker and build the image in apps/computer to give each person a private Linux computer."
          />
        ) : (
          <>
            <View className="flex-row gap-1 self-start rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
              {(["terminal", "files"] as const).map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t }}
                  onPress={() => setTab(t)}
                  className={`rounded-full px-4 py-1.5 ${tab === t ? "bg-white dark:bg-zinc-800" : ""}`}
                >
                  <Text
                    className={`text-sm font-medium ${tab === t ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}
                  >
                    {t === "terminal" ? "Terminal" : "Files"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {tab === "terminal" ? (
              <Terminal status={s} onError={setError} />
            ) : (
              <FilesPanel onError={setError} />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
