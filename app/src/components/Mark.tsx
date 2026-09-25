import { View } from 'react-native';
import type { IconName } from '../theme/icons.ts';
import { useTheme } from '../theme/theme.tsx';
import { size } from '../theme/tokens.ts';
import { Icon } from './Icon.tsx';

export interface MarkProps {
  icon: IconName;
  /** Plain on `surface-2`; `ink` for done; `blue` for needs you; `green` for a working connection. */
  tone?: 'plain' | 'ink' | 'blue' | 'green' | 'night';
  /** Only when the mark alone carries meaning. */
  label?: string;
}

/** A round 36px mark with an icon, at the start of a row or on a tile. */
export function Mark({ icon, tone = 'plain', label }: MarkProps) {
  const { colors } = useTheme();
  const [bg, fg] = {
    plain: [colors.surface2, colors.ink],
    ink: [colors.ink, colors.onInk],
    blue: [colors.blue, colors.onBlue],
    green: [colors.green, colors.onGreen],
    night: ['rgba(255,255,255,0.1)', colors.onNight],
  }[tone] as [string, string];
  return (
    <View
      style={{
        width: size.mark,
        height: size.mark,
        flexShrink: 0,
        borderRadius: 999,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={18} color={fg} {...(label ? { label } : {})} />
    </View>
  );
}
