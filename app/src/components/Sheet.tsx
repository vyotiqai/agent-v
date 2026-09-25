import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IconName } from '../theme/icons.ts';
import { useTheme } from '../theme/theme.tsx';
import { fonts, radius } from '../theme/tokens.ts';
import { Icon } from './Icon.tsx';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

export interface SheetItem {
  icon: IconName;
  label: string;
  onPress?: () => void;
  /** Delete, last, in `red-text`. */
  danger?: boolean;
}

export interface SheetProps {
  /** What it is about. */
  title?: string;
  /** At most eight; only what applies. */
  items?: SheetItem[];
  children?: ReactNode;
  onClose?: () => void;
}

/** A menu that rises from the bottom: its body. The screen shows it over a `scrim`. */
export function Sheet({ title, items = [], children, onClose }: SheetProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel={title}
      style={{
        paddingTop: 10,
        paddingHorizontal: 22,
        paddingBottom: 12,
        borderRadius: radius.sheet,
        backgroundColor: colors.surface,
      }}
    >
      <View
        style={{
          alignSelf: 'center',
          width: 40,
          height: 5,
          borderRadius: 3,
          backgroundColor: colors.lineStrong,
          marginBottom: 10,
        }}
      />
      {title ? (
        <Text
          color="inkMuted"
          natural
          style={{
            paddingTop: 4,
            paddingBottom: 6,
            fontFamily: fonts.sans500,
            fontSize: 13,
          }}
        >
          {title}
        </Text>
      ) : null}
      {items.map((it, i) => {
        const color = it.danger ? colors.redText : colors.ink;
        return (
          <Tap
            key={it.label}
            accessibilityRole="menuitem"
            onPress={it.onPress}
            style={{
              minHeight: 54,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.line,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <Icon name={it.icon} color={color} />
            <Text natural style={{ color, fontFamily: fonts.sans500, fontSize: 16 }}>
              {it.label}
            </Text>
          </Tap>
        );
      })}
      {children}
      {onClose ? (
        <Tap
          accessibilityRole="button"
          onPress={onClose}
          style={{
            marginTop: 8,
            height: 52,
            borderRadius: 999,
            backgroundColor: colors.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="button" natural>
            Close
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}
