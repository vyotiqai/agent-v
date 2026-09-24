import type { TeamInfo, TeamRole, Usage } from "@agent-v/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  Choices,
  ConfirmButton,
  ErrorText,
  Field,
  IconButton,
  Label,
  Muted,
  Segmented,
} from "../src/components/ui";
import { compact, openOutside, shortDate } from "../src/lib/account";
import { api } from "../src/lib/api";
import { useMe } from "../src/lib/me";
import { useResource } from "../src/lib/resource";

const roleLabels: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export default function TeamScreen() {
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const me = useMe();
  const team = useResource<TeamInfo>("/api/team", ["team"]);
  const usage = useResource<Usage>("/api/usage", ["usage"]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      const result = await fn();
      if (result && typeof result === "object" && "members" in result)
        team.setData(result as TeamInfo);
      else await team.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const t = team.data;
  const manager = t?.role === "owner" || t?.role === "admin";
  const teamPlan = usage.data?.billing.plans.find((p) => p.team && p.purchasable);
  const unknownInvite =
    invite && t && !t.received.some((r) => r.id === invite) && !t.team ? invite : null;

  return (
    <ScrollView
      className="flex-1 bg-zinc-50 dark:bg-zinc-950"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-6 px-4 pb-12 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      {(error ?? team.error) ? <ErrorText>{error ?? team.error}</ErrorText> : null}

      {t?.received.length ? (
        <View className="gap-3">
          <Label>Invitations</Label>
          {t.received.map((r) => (
            <Card
              key={r.id}
              className={`gap-3 ${r.id === invite ? "border-zinc-900 dark:border-zinc-100" : ""}`}
            >
              <Text className="text-[15px] text-zinc-900 dark:text-zinc-100">
                {r.inviter} invited you to join <Text className="font-semibold">{r.teamName}</Text>{" "}
                as {roleLabels[r.role].toLowerCase()}.
              </Text>
              <Muted className="text-xs">
                The team shares a plan. Your chats, tasks and files stay private to you. Expires{" "}
                {shortDate(r.expiresAt)}.
              </Muted>
              {t.team ? (
                <Muted className="text-xs">Leave {t.team.name} first to join another team.</Muted>
              ) : (
                <View className="flex-row gap-2">
                  <Button
                    title="Join"
                    className="flex-1"
                    busy={busy === `accept:${r.id}`}
                    onPress={() =>
                      void act(`accept:${r.id}`, () =>
                        api(`/api/team/invitations/${r.id}/accept`, { body: {} }),
                      )
                    }
                  />
                  <Button
                    title="Decline"
                    variant="secondary"
                    className="flex-1"
                    onPress={() =>
                      void act(`decline:${r.id}`, () =>
                        api(`/api/team/invitations/${r.id}/decline`, { body: {} }),
                      )
                    }
                  />
                </View>
              )}
            </Card>
          ))}
        </View>
      ) : null}

      {unknownInvite ? (
        <Card>
          <Muted>
            This invitation isn't for {me.data?.user.email ?? "this account"}, or it has expired.
            {me.data?.features.email && !me.data.user.emailVerified
              ? " Confirm your email in Settings first, then open the link again."
              : " Ask for a new one, sent to the email you sign in with."}
          </Muted>
        </Card>
      ) : null}

      {t && !t.team ? (
        <View>
          <Label>Create a team</Label>
          <Card className="gap-4">
            <Muted>
              A team shares one plan and billing. Everyone keeps their own agent: nobody, not even
              the owner, can see another member's chats, tasks or files.
            </Muted>
            <Field label="Team name" value={name} onChangeText={setName} placeholder="Acme" />
            <Button
              title="Create team"
              disabled={name.trim().length < 2}
              busy={busy === "create"}
              onPress={() =>
                void act("create", () => api("/api/team", { body: { name: name.trim() } }))
              }
            />
          </Card>
        </View>
      ) : null}

      {t?.team ? (
        <>
          <View>
            <Label>Team</Label>
            <Card className="gap-3">
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="flex-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {t.team.name}
                </Text>
                <Muted>{t.role ? roleLabels[t.role] : ""}</Muted>
              </View>
              <Muted>
                {t.team.subscription
                  ? `${t.team.subscription.plan[0]?.toUpperCase()}${t.team.subscription.plan.slice(1)} plan · ${t.team.subscription.seats ?? t.members.length} seats${t.team.subscription.status === "past_due" ? " · payment overdue" : ""}`
                  : "No team plan yet: everyone is on their own plan."}
              </Muted>
              {manager && t.team.subscription?.managed ? (
                <Button
                  title="Manage team billing"
                  variant="secondary"
                  icon="credit-card"
                  busy={busy === "portal"}
                  onPress={() =>
                    void act("portal", async () => {
                      const { url } = await api<{ url: string }>("/api/billing/portal", {
                        body: { scope: "team" },
                      });
                      await openOutside(url, { sameTab: true });
                    })
                  }
                />
              ) : manager && teamPlan && !t.team.subscription ? (
                <Button
                  title={`Get ${teamPlan.name} for everyone${teamPlan.price ? ` (${teamPlan.price})` : ""}`}
                  icon="users"
                  busy={busy === "checkout"}
                  onPress={() =>
                    void act("checkout", async () => {
                      const { url } = await api<{ url: string }>("/api/billing/checkout", {
                        body: { plan: teamPlan.id, scope: "team" },
                      });
                      await openOutside(url, { sameTab: true });
                    })
                  }
                />
              ) : null}
            </Card>
          </View>

          <View>
            <Label>Members</Label>
            <Card className="gap-4">
              {t.members.map((m) => {
                const self = m.userId === me.data?.user.id;
                return (
                  <View key={m.id} className="gap-2">
                    <View className="flex-row items-center gap-2">
                      <View className="flex-1">
                        <Text className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                          {m.name}
                          {self ? " (you)" : ""}
                        </Text>
                        <Muted className="text-xs">
                          {m.email} · {roleLabels[m.role]}
                          {m.tokens !== null ? ` · ${compact(m.tokens)} AI tokens this month` : ""}
                        </Muted>
                      </View>
                      {manager && !self && m.role !== "owner" ? (
                        <IconButton
                          name="user-x"
                          label={`Remove ${m.name}`}
                          onPress={() =>
                            void act(`remove:${m.id}`, () =>
                              api(`/api/team/members/${m.id}`, { method: "DELETE" }),
                            )
                          }
                        />
                      ) : null}
                    </View>
                    {manager && !self && (t.role === "owner" || m.role !== "owner") ? (
                      <Choices
                        value={m.role}
                        options={(t.role === "owner"
                          ? (["member", "admin", "owner"] as const)
                          : (["member", "admin"] as const)
                        ).map((r) => ({ value: r, label: roleLabels[r] }))}
                        onChange={(next) =>
                          void act(`role:${m.id}`, () =>
                            api(`/api/team/members/${m.id}`, {
                              method: "PATCH",
                              body: { role: next },
                            }),
                          )
                        }
                      />
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </View>

          {manager ? (
            <View>
              <Label>Invite</Label>
              <Card className="gap-4">
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="teammate@example.com"
                />
                <Segmented
                  role="radio"
                  value={role}
                  onChange={setRole}
                  options={[
                    { value: "member", label: "Member" },
                    { value: "admin", label: "Admin" },
                  ]}
                />
                <Button
                  title="Send invitation"
                  icon="send"
                  disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}
                  busy={busy === "invite"}
                  onPress={() =>
                    void act("invite", async () => {
                      const created = await api<{ link: string }>("/api/team/invitations", {
                        body: { email: email.trim(), role },
                      });
                      setLastLink(created.link);
                      setEmail("");
                    })
                  }
                />
                {lastLink ? (
                  <View className="gap-1">
                    <Muted className="text-xs">
                      {me.data?.features.email
                        ? "Sent. You can also share this link:"
                        : "Email isn't set up on this server. Share this link:"}
                    </Muted>
                    <Text selectable className="text-sm text-zinc-800 dark:text-zinc-200">
                      {lastLink}
                    </Text>
                  </View>
                ) : null}
                {t.invitations.map((i) => (
                  <View key={i.id} className="flex-row items-center gap-2">
                    <View className="flex-1">
                      <Text className="text-[15px] text-zinc-800 dark:text-zinc-200">
                        {i.email}
                      </Text>
                      <Muted className="text-xs">
                        {roleLabels[i.role]} · waiting · expires {shortDate(i.expiresAt)}
                      </Muted>
                    </View>
                    <IconButton
                      name="x"
                      label={`Cancel invitation for ${i.email}`}
                      onPress={() =>
                        void act(`cancel:${i.id}`, () =>
                          api(`/api/team/invitations/${i.id}`, { method: "DELETE" }),
                        )
                      }
                    />
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          <View className="gap-3">
            {t.role === "owner" ? (
              <ConfirmButton
                title="Delete team"
                confirmTitle="Tap again: this ends the team plan for everyone"
                busy={busy === "delete"}
                onConfirm={() => void act("delete", () => api("/api/team", { method: "DELETE" }))}
              />
            ) : (
              <ConfirmButton
                title="Leave team"
                confirmTitle="Tap again to leave"
                busy={busy === "leave"}
                onConfirm={() => void act("leave", () => api("/api/team/leave", { body: {} }))}
              />
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
