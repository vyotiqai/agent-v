import { View } from 'react-native';
import type { IconName } from '../theme/icons.ts';
import { useTheme } from '../theme/theme.tsx';
import { fonts, size } from '../theme/tokens.ts';
import { Icon } from './Icon.tsx';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

export interface ButtonProps {
  /** A verb that says exactly what happens: Start, Answer, Raise the limit. */
  children: string;
  /** `primary`: the one main action; `secondary`: its alternative; `small`: inside blocks; `danger`: Delete. */
  variant?: 'primary' | 'secondary' | 'small' | 'danger';
  icon?: IconName;
  trailing?: IconName;
  grow?: boolean;
  /** When it can't be used now; say why nearby. */
  disabled?: boolean;
  onPress?: () => void;
}

/** Buttons for everything but signing, which is a HoldButton. */
export function Button({
  children,
  variant = 'primary',
  icon,
  trailing,
  grow = false,
  disabled = false,
  onPress,
}: ButtonProps) {
  const { colors } = useTheme();
  const small = variant === 'small';
  const paint: Record<NonNullable<ButtonProps['variant']>, [string, string, string]> = {
    primary: [colors.action, colors.onAction, 'transparent'],
    secondary: ['transparent', colors.ink, colors.lineStrong],
    small: [colors.surface2, colors.ink, 'transparent'],
    danger: [colors.red, colors.onRed, 'transparent'],
  };
  const [bg, fg, border] = disabled
    ? [colors.disabled, colors.inkMuted, 'transparent']
    : paint[variant];
  const height = small ? 36 : size.button;
  return (
    <Tap
      accessibilityRole="button"
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      drawnHeight={height}
      style={{
        height,
        paddingHorizontal: small ? 14 : 22,
        borderRadius: 999,
        borderWidth: variant === 'secondary' && !disabled ? 1 : 0,
        borderColor: border,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flexGrow: grow ? 1 : 0,
      }}
    >
      {icon ? <Icon name={icon} size={19} color={fg} /> : null}
      <Text
        natural
        numberOfLines={1}
        style={{
          color: fg,
          fontSize: small ? 14 : 16,
          fontFamily: small || variant === 'secondary' ? fonts.sans500 : fonts.sans600,
        }}
      >
        {children}
      </Text>
      {trailing ? (
        <View>
          <Icon name={trailing} size={18} stroke={2} color={fg} />
        </View>
      ) : null}
    </Tap>
  );
}
