import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { fonts, radius } from '../theme/tokens.ts';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

export interface ChoiceCardProps {
  title: string;
  /** What the choice means; never hide it. */
  detail?: string;
  /** A figure or a mark before the words. */
  lead?: ReactNode;
  checked?: boolean;
  onChange?: () => void;
}

/** One choice among two to four, as a card with a radio. The chosen card has a 2px `ink` edge. */
export function ChoiceCard({ title, detail, lead, checked = false, onChange }: ChoiceCardProps) {
  const { colors } = useTheme();
  return (
    <Tap
      accessibilityRole="radio"
      aria-checked={checked}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={onChange}
      style={{
        minHeight: 72,
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: checked ? colors.ink : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      {lead ?? null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text natural style={{ fontFamily: fonts.sans500, fontSize: 16 }}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" color="inkMuted" natural>
            {detail}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          borderWidth: checked ? 2 : 1,
          borderColor: checked ? colors.ink : colors.controlOff,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? (
          <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: colors.ink }} />
        ) : null}
      </View>
    </Tap>
  );
}
