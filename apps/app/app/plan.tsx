import { type Metric, metrics, type PlanInfo, type Usage } from "@agent-v/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, ErrorText, Label, Muted, Progress } from "../src/components/ui";
import { compact, openOutside, shortDate } from "../src/lib/account";
import { api } from "../src/lib/api";
import { useResource } from "../src/lib/resource";

const sources: Record<Usage["source"], string> = {
  default: "Everyone starts here",
  personal: "Your subscription",
  team: "Included with your team",
  granted: "Granted by the operators",
};

const amount = (metric: Metric, n: number) => (metric === "tokens" ? compact(n) : String(n));

function Meter({ usage, metric }: { usage: Usage; metric: (typeof metrics)[number] }) {
  const used = usage.used[metric.id];
  const limit = usage.plan.limits[metric.id];
  const share = limit ? used / limit : 0;
  const unit = metric.unit ? ` ${metric.unit}` : "";
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-[15px] text-zinc-800 dark:text-zinc-200">{metric.label}</Text>
        <Text className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
          {amount(metric.id, used)}
          {limit === null ? unit : ` of ${amount(metric.id, limit)}${unit}`}
          {limit !== null && share >= 0.8
            ? ` · ${Math.min(100, Math.round(share * 100))}% used`
            : ""}
        </Text>
      </View>
      {limit !== null ? (
        <Progress
          value={share}
          label={`${metric.label}: ${Math.round(share * 100)}% used`}
          tone={share >= 1 ? "full" : share >= 0.8 ? "warn" : "normal"}
        />
      ) : null}
    </View>
  );
}

function PlanCard({
  plan,
  current,
  onChoose,
  busy,
}: {
  plan: PlanInfo;
  current: boolean;
  onChoose?: () => void;
  busy: boolean;
}) {
  return (
    <Card className={`gap-3 ${current ? "border-zinc-900 dark:border-zinc-100" : ""}`}>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{plan.name}</Text>
        <Muted>{plan.price ?? "Free"}</Muted>
      </View>
      <Muted className="text-xs">
        {plan.limits.tokens === null ? "Unlimited" : compact(plan.limits.tokens)} AI tokens ·{" "}
        {plan.limits.tasks ?? "unlimited"} tasks · {plan.limits.computerMinutes ?? "unlimited"} min
        computer a month{plan.team ? " · per member" : ""}
      </Muted>
      {current ? (
        <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Your plan</Text>
      ) : onChoose ? (
        <Button
          title={plan.team ? "Set up for your team" : `Upgrade to ${plan.name}`}
          variant={plan.team ? "secondary" : "primary"}
          onPress={onChoose}
          busy={busy}
        />
      ) : null}
    </Card>
  );
}

export default function PlanScreen() {
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const usage = useResource<Usage>("/api/usage", ["usage", "task", "file", "connector", "monitor"]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const buy = (plan: PlanInfo) =>
    plan.team
      ? router.push("/team")
      : act(plan.id, async () => {
          const { url } = await api<{ url: string }>("/api/billing/checkout", {
            body: { plan: plan.id },
          });
          await openOutside(url, { sameTab: true });
        });
  const manage = () =>
    act("portal", async () => {
      const { url } = await api<{ url: string }>("/api/billing/portal", { body: {} });
      await openOutside(url, { sameTab: true });
    });

  const u = usage.data;
  const rank = (id: string) => u?.billing.plans.findIndex((p) => p.id === id) ?? -1;
  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-6 px-4 pb-12 pt-4"
    >
      {checkout === "success" ? (
        <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950">
          <Text className="text-[15px] text-emerald-800 dark:text-emerald-200">
            Thank you! Your plan changes as soon as the payment is confirmed.
          </Text>
        </Card>
      ) : null}
      {(error ?? usage.error) ? <ErrorText>{error ?? usage.error}</ErrorText> : null}
      {u ? (
        <>
          <View>
            <Label>Your plan</Label>
            <Card className="gap-4">
              <View className="gap-1">
                <Text className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {u.plan.name}
                </Text>
                <Muted>
                  {sources[u.source]}
                  {u.billing.subscription?.cancelAtPeriodEnd &&
                  u.billing.subscription.currentPeriodEnd
                    ? ` · ends ${shortDate(u.billing.subscription.currentPeriodEnd)}`
                    : ""}
                </Muted>
              </View>
              {u.billing.subscription?.managed ? (
                <Button
                  title="Manage billing"
                  variant="secondary"
                  icon="credit-card"
                  onPress={() => void manage()}
                  busy={busy === "portal"}
                />
              ) : null}
            </Card>
          </View>

          <View>
            <Label>This month</Label>
            <Card className="gap-4">
              {metrics.map((metric) => (
                <Meter key={metric.id} usage={u} metric={metric} />
              ))}
              <Muted className="text-xs">
                {u.enforced
                  ? `Monthly allowances reset on ${shortDate(u.period.end)}.`
                  : "This server has no limits; usage is shown so you can keep an eye on it."}
              </Muted>
            </Card>
          </View>

          {u.billing.available && u.billing.plans.some((p) => p.purchasable) ? (
            <View className="gap-3">
              <Label>Plans</Label>
              {u.billing.plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  current={plan.id === u.plan.id}
                  busy={busy === plan.id}
                  onChoose={
                    plan.purchasable && rank(plan.id) > rank(u.plan.id) && !u.billing.subscription
                      ? () => void buy(plan)
                      : undefined
                  }
                />
              ))}
            </View>
          ) : null}

          {u.models.length ? (
            <View>
              <Label>AI usage by model</Label>
              <Card className="gap-2">
                {u.models.map((m) => (
                  <View key={m.model} className="flex-row items-baseline justify-between gap-3">
                    <Text
                      numberOfLines={1}
                      className="flex-1 text-[15px] text-zinc-800 dark:text-zinc-200"
                    >
                      {m.model}
                    </Text>
                    <Text className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                      {compact(m.input)} in · {compact(m.output)} out
                    </Text>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
