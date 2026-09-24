import type { AdminOverview, AdminUser, Usage } from "@agent-v/shared";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  Choices,
  ConfirmButton,
  Empty,
  ErrorText,
  Field,
  Label,
  Muted,
  Stat,
} from "../src/components/ui";
import { compact, shortDate } from "../src/lib/account";
import { api } from "../src/lib/api";
import { useMe } from "../src/lib/me";
import { useResource } from "../src/lib/resource";

function UserRow({
  person,
  plans,
  selfId,
  onChange,
}: {
  person: AdminUser;
  plans: { id: string; name: string }[];
  selfId?: string;
  onChange: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await onChange(patch);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-2 border-zinc-100 border-t pt-3 first:border-t-0 first:pt-0 dark:border-zinc-800">
      <View>
        <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
          {person.name}
          {person.role === "admin" ? " · operator" : ""}
          {person.banned ? " · suspended" : ""}
        </Text>
        <Muted className="text-xs">
          {person.email}
          {person.emailVerified ? "" : " (unconfirmed)"} · joined {shortDate(person.createdAt)} ·{" "}
          {compact(person.tokens)} tokens · {person.tasks} tasks this month
        </Muted>
      </View>
      <Choices
        label={`Plan (${person.planSource === "granted" ? "granted" : person.planSource})`}
        value={person.planSource === "granted" ? person.plan : "none"}
        options={[
          { value: "none", label: "No grant" },
          ...plans.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onChange={(plan) => void run({ plan: plan === "none" ? null : plan })}
      />
      {person.id !== selfId ? (
        person.banned ? (
          <Button
            title="Restore access"
            variant="secondary"
            busy={busy}
            onPress={() => void run({ banned: false })}
          />
        ) : (
          <ConfirmButton
            title="Suspend"
            confirmTitle="Tap again: signs them out everywhere"
            busy={busy}
            onConfirm={() => void run({ banned: true })}
          />
        )
      ) : null}
    </View>
  );
}

/** Operators: accounts, plans and suspensions. No one's chats or files are visible here. */
export default function AdminScreen() {
  const me = useMe();
  const usage = useResource<Usage>("/api/usage", ["usage"]);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string, offset = 0) => {
    try {
      const page = await api<AdminOverview>(
        `/api/admin/users?search=${encodeURIComponent(query)}&offset=${offset}`,
      );
      setData((prev) =>
        offset && prev ? { ...page, users: [...prev.users, ...page.users] } : page,
      );
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(search), 250);
    return () => clearTimeout(timer);
  }, [search, load]);

  if (me.data && !me.data.features.admin)
    return <Empty icon="lock" title="Operators only" body="This account can't open the admin." />;

  const plans = (usage.data?.billing.plans ?? []).map((p) => ({ id: p.id, name: p.name }));
  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-3xl gap-6 px-4 pb-12 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      {error ? <ErrorText>{error}</ErrorText> : null}
      {data ? (
        <View className="flex-row flex-wrap gap-3">
          <Stat label="Accounts" value={compact(data.totals.users)} />
          <Stat label="Active this month" value={compact(data.totals.activeThisMonth)} />
          <Stat label="AI tokens this month" value={compact(data.totals.tokens)} />
          <Stat label="Tasks this month" value={compact(data.totals.tasks)} />
        </View>
      ) : null}
      <View>
        <Label>Accounts</Label>
        <Card className="gap-3">
          <Field
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email"
            autoCapitalize="none"
          />
          {data?.users.map((person) => (
            <UserRow
              key={person.id}
              person={person}
              plans={plans}
              selfId={me.data?.user.id}
              onChange={async (patch) => {
                try {
                  await api(`/api/admin/users/${person.id}`, { method: "PATCH", body: patch });
                  await load(search);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          ))}
          {data && data.users.length < data.total ? (
            <Button
              title="Show more"
              variant="ghost"
              onPress={() => void load(search, data.users.length)}
            />
          ) : null}
          {data && !data.users.length ? <Muted>No accounts match.</Muted> : null}
        </Card>
        <Muted className="px-1 pt-2 text-xs">
          Operators manage accounts and plans. They can't read anyone's chats, tasks or files, or
          sign in as someone else.
        </Muted>
      </View>
    </ScrollView>
  );
}
