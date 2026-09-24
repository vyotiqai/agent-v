import type { FinanceReport } from "@agent-v/shared";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { api } from "../../lib/api";
import { money } from "../../lib/life";
import type { useResource } from "../../lib/resource";
import { ago } from "../../lib/time";
import { Button, Choices, Empty, ErrorText, Icon, Muted } from "../ui";

type Signs = "auto" | "expenses_positive" | "expenses_negative";

async function readPicked(asset: DocumentPicker.DocumentPickerAsset) {
  if (Platform.OS === "web" && asset.file) return asset.file.text();
  // React Native's fetch reads local file URIs.
  return (await fetch(asset.uri)).text();
}

export function MoneyPanel({
  reports,
}: {
  reports: ReturnType<typeof useResource<FinanceReport[]>>;
}) {
  const [busy, setBusy] = useState<"file" | "sample" | null>(null);
  const [signs, setSigns] = useState<Signs>("auto");
  const [error, setError] = useState<string | null>(null);

  const finish = (report: FinanceReport) => router.push(`/money/${report.id}`);
  const importFile = async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "text/plain", "application/vnd.ms-excel"],
      copyToCacheDirectory: true,
    });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    setBusy("file");
    try {
      const csv = await readPicked(asset);
      finish(
        await api<FinanceReport>("/api/finance/import", {
          body: {
            name: asset.name.replace(/\.(csv|txt)$/i, "").slice(0, 120) || "Transactions",
            csv,
            signs,
          },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const sample = async () => {
    setError(null);
    setBusy("sample");
    try {
      finish(await api<FinanceReport>("/api/finance/sample", { body: {} }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-4">
      <View className="gap-3 rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
          Import transactions
        </Text>
        <Muted>
          A CSV export from your bank or card: a date, a description, and an amount (or debit and
          credit) column. It stays on your server.
        </Muted>
        <Choices
          label="Spending in the file is"
          value={signs}
          onChange={setSigns}
          options={[
            { value: "auto", label: "Detect" },
            { value: "expenses_negative", label: "Negative" },
            { value: "expenses_positive", label: "Positive" },
          ]}
        />
        <View className="flex-row gap-2">
          <Button
            title="Choose CSV"
            icon="upload"
            className="flex-1"
            busy={busy === "file"}
            onPress={() => void importFile()}
          />
          <Button
            title="Try an example"
            variant="secondary"
            busy={busy === "sample"}
            onPress={() => void sample()}
          />
        </View>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>
      {reports.error ? <ErrorText>{reports.error}</ErrorText> : null}
      {reports.data?.length === 0 ? (
        <Empty
          icon="pie-chart"
          title="No spending reports"
          body="Import a CSV to see where the money goes, recurring charges, and a savings plan."
        />
      ) : null}
      <View className="gap-2">
        {(reports.data ?? []).map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push(`/money/${r.id}`)}
            className="flex-row items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <Icon name="pie-chart" size={18} />
            <View className="flex-1 gap-0.5">
              <Text
                numberOfLines={1}
                className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100"
              >
                {r.name}
              </Text>
              <Muted className="text-xs">
                {r.period.from} – {r.period.to} · {r.count} transactions · {ago(r.createdAt)}
              </Muted>
            </View>
            <View className="items-end">
              <Text className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                {money(r.spending, r.currency)}
              </Text>
              <Muted className="text-xs">spent</Muted>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
