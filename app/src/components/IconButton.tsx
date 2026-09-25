import type { IconName } from '../theme/icons.ts';
import { useTheme } from '../theme/theme.tsx';
import { size } from '../theme/tokens.ts';
import { Icon } from './Icon.tsx';
import { Tap } from './Tap.tsx';

export interface IconButtonProps {
  icon: IconName;
  /** What it does, for screen readers: an icon alone says nothing. */
  label: string;
  /** `night` on the dark top, `surface` on blocks, `blue` for speaking. */
  tone?: 'night' | 'surface' | 'blue';
  onPress?: () => void;
}

/** A round 44px button with one icon. */
export function IconButton({ icon, label, tone = 'night', onPress }: IconButtonProps) {
  const { colors } = useTheme();
  const [bg, fg] =
    tone === 'blue'
      ? [colors.blue, colors.onBlue]
      : tone === 'surface'
        ? [colors.surface2, colors.ink]
        : [colors.glass, colors.onNight];
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: size.target,
        height: size.target,
        borderRadius: 999,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} color={fg} />
    </Tap>
  );
}
