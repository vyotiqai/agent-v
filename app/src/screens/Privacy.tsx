import type { Phone } from '@agentv/shared/accounts.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Block } from '../components/Block.tsx';
import { Button } from '../components/Button.tsx';
import { Confirm } from '../components/Confirm.tsx';
import { DarkTop } from '../components/DarkTop.tsx';
import { Problem } from '../components/Problem.tsx';
import { Row } from '../components/Row.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { Tap } from '../components/Tap.tsx';
import { Text } from '../components/Text.tsx';
import { UndoBar } from '../components/UndoBar.tsx';
import { ago, day } from '../format.ts';
import { useTheme } from '../theme/theme.tsx';

/** What the page needs from the API. */
export interface PrivacySource {
  phones(): Promise<Phone[]>;
  signOutPhone(id: string): Promise<void>;
  signOut(): Promise<void>;
}

/**
 * Privacy and your data (stage 4). In slice 1 it shows what works so far: your phones (D137) and
 * Sign out (D138). The rest of the page (export, what I remember, files, how your data is kept,
 * deleting the account) arrives with the slices that make it work.
 */
export function Privacy({ source, now }: { source: PrivacySource; now?: Date }) {
  const { colors } = useTheme();
  const [phones, setPhones] = useState<Phone[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Which confirmation is open: another phone's id, or "self" for signing out here.
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bar, setBar] = useState<string | null>(null);
  const barTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setPhones(await source.phones());
    } catch {
      setFailed(true);
    }
  }, [source]);

  useEffect(() => {
    load();
    return () => {
      if (barTimer.current) clearTimeout(barTimer.current);
    };
  }, [load]);

  // What just happened, for 5 seconds (D65); signing a phone out can't be undone, so no Undo.
  const say = (text: string) => {
    if (barTimer.current) clearTimeout(barTimer.current);
    setBar(text);
    barTimer.current = setTimeout(() => setBar(null), 5000);
  };

  const signOutOther = async (phone: Phone) => {
    setBusy(true);
    try {
      await source.signOutPhone(phone.id);
      setPhones((list) => (list ?? []).filter((p) => p.id !== phone.id));
      say(`${phone.model} is signed out. It will need to sign in again.`);
    } catch {
      say(`Couldn’t sign out ${phone.model}. Check your connection and try again.`);
    } finally {
      setBusy(false);
      setAsking(null);
    }
  };

  const confirmingPhone = phones?.find((p) => p.id === asking) ?? null;
  const at = now ?? new Date();
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <DarkTop title="Privacy and your data" variant="settings" />
        <View style={{ paddingTop: 12, paddingHorizontal: 12, gap: 8 }}>
          {phones === null && !failed ? <Skeleton label="Loading your phones" /> : null}
          {failed ? (
            <Problem
              title="Your phones didn’t load"
              detail="Check your connection, then try again."
              onRetry={load}
            />
          ) : null}
          {phones ? (
            <Block label="Your phones" variant="settings">
              {phones.map((p) => (
                <Row
                  key={p.id}
                  size="settings"
                  title={p.model}
                  detail={
                    p.current
                      ? `This phone · signed in ${day(p.signedInAt, at)}`
                      : `Last used ${ago(p.lastUsedAt, at)}`
                  }
                  trailing={
                    p.current || asking !== null ? null : (
                      <Button variant="small" onPress={() => setAsking(p.id)}>
                        Sign out
                      </Button>
                    )
                  }
                />
              ))}
              {confirmingPhone ? (
                <View style={{ marginBottom: 12 }}>
                  <Confirm
                    title={`Sign out ${confirmingPhone.model}?`}
                    detail="It will need to sign in again. Your jobs keep running."
                    confirmLabel="Sign out"
                    onCancel={() => setAsking(null)}
                    onConfirm={() => {
                      if (!busy) signOutOther(confirmingPhone);
                    }}
                  />
                </View>
              ) : null}
            </Block>
          ) : null}
          <Block variant="settings">
            {asking === 'self' ? (
              <View style={{ marginVertical: 8 }}>
                <Confirm
                  title="Sign out on this phone?"
                  detail="Your jobs keep running; sign in again to see them."
                  confirmLabel="Sign out"
                  onCancel={() => setAsking(null)}
                  onConfirm={() => {
                    if (busy) return;
                    setBusy(true);
                    source.signOut().finally(() => setBusy(false));
                  }}
                />
              </View>
            ) : (
              <Tap
                accessibilityRole="button"
                disabled={asking !== null}
                onPress={() => setAsking('self')}
                style={{ minHeight: 56, justifyContent: 'center' }}
              >
                <Text variant="row" natural>
                  Sign out
                </Text>
              </Tap>
            )}
          </Block>
        </View>
      </ScrollView>
      {bar ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 28 }}>
          <UndoBar>{bar}</UndoBar>
        </View>
      ) : null}
    </View>
  );
}
