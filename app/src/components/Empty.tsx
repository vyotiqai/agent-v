import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IconName } from '../theme/icons.ts';
import { useTheme } from '../theme/theme.tsx';
import { fonts, radius } from '../theme/tokens.ts';
import { Mark } from './Mark.tsx';
import { Text } from './Text.tsx';

/** What a place is for, when there is nothing in it yet, and how to fill it. */
export function Empty({
  icon = 'grid',
  title,
  detail,
  children,
}: {
  icon?: IconName;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        paddingVertical: 22,
        paddingHorizontal: 20,
        borderRadius: radius.block,
        backgroundColor: colors.surface,
        gap: 6,
      }}
    >
      <Mark icon={icon} />
      <Text
        accessibilityRole="header"
        style={{
          marginTop: 12,
          fontFamily: fonts.sans500,
          fontSize: 22,
          lineHeight: 26.4,
          letterSpacing: -0.44,
        }}
      >
        {title}
      </Text>
      <Text variant="sub" color="inkMuted">
        {detail}
      </Text>
      {children}
    </View>
  );
}
