import { View } from 'react-native';
import type { IconName } from '../theme/icons.ts';
import { useTheme } from '../theme/theme.tsx';
import { fonts } from '../theme/tokens.ts';
import { Icon } from './Icon.tsx';
import { Breathing } from './motion.tsx';
import { Text } from './Text.tsx';

export interface StatusChipProps {
  /** The dot's meaning: needs you (blue), can't be undone (red), working, or quiet. */
  tone?: 'needs' | 'undone' | 'working' | 'quiet';
  /** The dot breathes while something is happening now. */
  live?: boolean;
  /** An icon in place of the dot. */
  icon?: IconName;
  children: string;
}

/** A job's state, in a chip on the dark top. */
export function StatusChip({ tone = 'working', live = false, icon, children }: StatusChipProps) {
  const { colors } = useTheme();
  const dot = {
    needs: colors.blueOnNight,
    undone: colors.redOnNight,
    working: colors.onNight,
    quiet: colors.onNightMuted,
  }[tone];
  return (
    <View
      style={{
        height: 32,
        paddingHorizontal: 13,
        borderRadius: 999,
        backgroundColor: colors.glass,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
      }}
    >
      {icon ? (
        <Icon name={icon} size={15} color={colors.onNight} />
      ) : (
        <Breathing on={live}>
          <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: dot }} />
        </Breathing>
      )}
      <Text
        variant="caption"
        color="onNight"
        natural
        numberOfLines={1}
        style={{ fontFamily: fonts.sans500 }}
      >
        {children}
      </Text>
    </View>
  );
}
