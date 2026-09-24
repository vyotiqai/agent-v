import type { FinanceReportDetail } from "@agent-v/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Button, Card, ErrorText, Field, Icon, Label, Muted } from "../../src/components/ui";
import { api } from "../../src/lib/api";
import { money } from "../../src/lib/life";
import { useResource } from "../../src/lib/resource";

// Validated categorical slots 1 and 2 (light / dark steps): received is blue, spent is orange.
const received = "bg-[#2a78d6] dark:bg-[#3987e5]";
const spent = "bg-[#eb6834] dark:bg-[#d95926]";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View className="flex-1 gap-1 rounded-2xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
      <View className="flex-row items-center gap-1.5">
        {tone ? <View className={`h-2 w-2 rounded-full ${tone}`} /> : null}
        <Muted className="text-xs">{label}</Muted>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
      >
        {value}
      </Text>
    </View>
  );
}

/** One thin bar anchored at the left, with its value in text ink beside it. */
function Bar({ share, tone, label }: { share: number; tone: string; label: string }) {
  return (
    <View className="flex-row items-center gap-2" accessibilityLabel={label}>
      <View className="h-2 flex-1 flex-row">
        <View
          className={`h-2 rounded-r ${tone}`}
          style={{ width: `${Math.max(1, Math.round(share * 100))}%` }}
        />
      </View>
    </View>
  );
}

export default function MoneyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useResource<FinanceReportDetail>(
    id ? `/api/finance/${id}` : null,
    ["finance", "goal"],
    (event) => event.type === "goal" || event.id === id,
  );
  const [target, setTarget] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!detail.data)
    return (
      <View className="flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        {detail.error ? <ErrorText>{detail.error}</ErrorText> : <ActivityIndicator />}
      </View>
    );
  const { report: r, transactions } = detail.data;
  const m = (n: number) => money(n, r.currency);
  const months = Math.max(1, r.months.length);
  const monthlyNet = r.net / months;
  const suggested = monthlyNet > 0 ? Math.max(50, Math.round((monthlyNet * 0.2) / 50) * 50) : 100;
  const topCategory = r.categories[0]?.amount ?? 1;
  const monthMax = Math.max(1, ...r.months.flatMap((x) => [x.income, x.spending]));
  const recurringTotal = r.recurring.reduce((s, x) => s + x.amount, 0);

  const saveGoal = async () => {
    setBusy("goal");
    setError(null);
    try {
      const { goalId } = await api<{ goalId: string }>(`/api/finance/${r.id}/goal`, {
        body: { monthlyTarget: Number(target ?? suggested) },
      });
      router.push(`/goals/${goalId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy("delete");
    try {
      await api(`/api/finance/${r.id}`, { method: "DELETE" });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-6 p-4 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: r.name }} />
      <View className="gap-1">
        <Text className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{r.name}</Text>
        <Muted>
          {r.period.from} – {r.period.to} · {r.count} transactions
        </Muted>
      </View>

      <View className="flex-row gap-2">
        <Stat label="Spent" value={m(r.spending)} tone={spent} />
        <Stat label="Received" value={m(r.income)} tone={received} />
        <Stat label={r.net >= 0 ? "Saved" : "Overspent"} value={m(Math.abs(r.net))} />
      </View>
      {r.warnings.length ? (
        <View className="gap-1 rounded-xl bg-amber-50 p-3 dark:bg-amber-950">
          {r.warnings.map((w) => (
            <View key={w} className="flex-row gap-2">
              <Icon name="info" size={14} className="mt-0.5 text-amber-700 dark:text-amber-300" />
              <Text className="flex-1 text-sm text-amber-800 dark:text-amber-200">{w}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View>
        <Label>Where it went</Label>
        <Card className="gap-3">
          {r.categories.map((c) => (
            <View key={c.name} className="gap-1">
              <View className="flex-row justify-between gap-2">
                <Text className="text-sm text-zinc-800 dark:text-zinc-200">{c.name}</Text>
                <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                  {m(c.amount)} · {Math.round(c.share * 100)}%
                </Text>
              </View>
              <Bar
                share={c.amount / topCategory}
                tone={spent}
                label={`${c.name}: ${m(c.amount)}`}
              />
            </View>
          ))}
        </Card>
      </View>

      {r.months.length > 1 ? (
        <View>
          <Label>By month</Label>
          <Card className="gap-4">
            <View className="flex-row gap-4">
              <View className="flex-row items-center gap-1.5">
                <View className={`h-2 w-2 rounded-full ${received}`} />
                <Muted className="text-xs">Received</Muted>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className={`h-2 w-2 rounded-full ${spent}`} />
                <Muted className="text-xs">Spent</Muted>
              </View>
            </View>
            {r.months.map((x) => (
              <View key={x.month} className="gap-1">
                <View className="flex-row justify-between">
                  <Text className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {new Date(`${x.month}-01T00:00:00`).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                  <Muted className="text-xs">
                    {m(x.income)} in · {m(x.spending)} out
                  </Muted>
                </View>
                <View className="gap-0.5">
                  <Bar
                    share={x.income / monthMax}
                    tone={received}
                    label={`Received ${m(x.income)}`}
                  />
                  <Bar
                    share={x.spending / monthMax}
                    tone={spent}
                    label={`Spent ${m(x.spending)}`}
                  />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {r.recurring.length ? (
        <View>
          <Label>Repeats every month</Label>
          <Card className="gap-2.5">
            {r.recurring.map((x) => (
              <View key={x.merchant} className="flex-row items-center gap-3">
                <Icon name="repeat" size={14} />
                <View className="flex-1">
                  <Text className="text-sm text-zinc-800 dark:text-zinc-200">{x.merchant}</Text>
                  <Muted className="text-xs">
                    {x.category} · {x.months} months
                  </Muted>
                </View>
                <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {m(x.amount)}
                </Text>
              </View>
            ))}
            <View className="flex-row justify-between border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
              <Muted>Together</Muted>
              <Text className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {m(recurringTotal)} a month
              </Text>
            </View>
          </Card>
        </View>
      ) : null}

      <View>
        <Label>Savings goal</Label>
        <Card className="gap-3">
          {r.goalId ? (
            <>
              <Muted>This report has a savings goal with a plan.</Muted>
              <Button
                title="Open savings goal"
                icon="target"
                variant="secondary"
                onPress={() => router.push(`/goals/${r.goalId}`)}
              />
            </>
          ) : (
            <>
              <Muted>
                {monthlyNet > 0
                  ? `You kept about ${m(monthlyNet)} a month. Set aside part of it on purpose.`
                  : "Spending was above income. A small monthly target is a good start."}
              </Muted>
              <Field
                label="Save each month"
                value={target ?? String(suggested)}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
              />
              <Button
                title="Turn this into a savings goal"
                icon="target"
                busy={busy === "goal"}
                disabled={!(Number(target ?? suggested) > 0)}
                onPress={() => void saveGoal()}
              />
            </>
          )}
        </Card>
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <View>
        <Label>Transactions</Label>
        <View className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {(showAll ? transactions : transactions.slice(0, 25)).map((t, i) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: a saved report's rows never reorder, and identical rows are legitimate
              key={`${t.date}:${i}`}
              className={`flex-row items-center gap-3 px-4 py-2.5 ${i ? "border-t border-zinc-100 dark:border-zinc-800" : ""}`}
            >
              <View className="flex-1 gap-0.5">
                <Text numberOfLines={1} className="text-sm text-zinc-900 dark:text-zinc-100">
                  {t.merchant}
                </Text>
                <Muted className="text-xs">
                  {t.date} · {t.category}
                </Muted>
              </View>
              <Text
                className={`text-sm font-medium ${t.amount < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100"}`}
              >
                {t.amount < 0 ? `+${m(-t.amount)}` : m(t.amount)}
              </Text>
            </View>
          ))}
        </View>
        {!showAll && transactions.length > 25 ? (
          <Pressable onPress={() => setShowAll(true)} className="items-center py-3">
            <Muted>Show all {transactions.length}</Muted>
          </Pressable>
        ) : null}
      </View>

      <Button
        title={confirmDelete ? "Tap again to delete" : "Delete report"}
        variant="danger"
        icon="trash-2"
        busy={busy === "delete"}
        onPress={() => void remove()}
      />
    </ScrollView>
  );
}
