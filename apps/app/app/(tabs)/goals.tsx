import type { FinanceReport, Goal, Idea, Monitor } from "@agent-v/shared";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoalsPanel } from "../../src/components/life/GoalsPanel";
import { IdeasPanel } from "../../src/components/life/IdeasPanel";
import { MoneyPanel } from "../../src/components/life/MoneyPanel";
import { WatchesPanel } from "../../src/components/life/WatchesPanel";
import { Segmented, Title } from "../../src/components/ui";
import { useResource } from "../../src/lib/resource";

type Section = "ideas" | "goals" | "watches" | "money";
const sections: Section[] = ["ideas", "goals", "watches", "money"];

export default function Goals() {
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>("goals");
  useEffect(() => {
    if (sections.includes(params.section as Section)) setSection(params.section as Section);
  }, [params.section]);
  // All four load up front so switching sections is instant and the Ideas badge is current.
  const ideas = useResource<Idea[]>("/api/ideas", ["idea", "task"]);
  const goals = useResource<Goal[]>("/api/goals", ["goal", "task"]);
  const watches = useResource<Monitor[]>("/api/monitors", ["monitor"]);
  const reports = useResource<FinanceReport[]>("/api/finance", ["finance"]);
  const fresh = (ideas.data ?? []).filter((i) => i.status === "new").length;
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-zinc-50 dark:bg-zinc-950">
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-2xl gap-4 px-4 pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <Title>Goals</Title>
        <Segmented
          value={section}
          onChange={setSection}
          options={[
            { value: "ideas", label: "Ideas", badge: fresh },
            { value: "goals", label: "Goals" },
            { value: "watches", label: "Watches" },
            { value: "money", label: "Money" },
          ]}
        />
        <View>
          {section === "ideas" ? (
            <IdeasPanel ideas={ideas} />
          ) : section === "goals" ? (
            <GoalsPanel goals={goals} />
          ) : section === "watches" ? (
            <WatchesPanel watches={watches} />
          ) : (
            <MoneyPanel reports={reports} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
