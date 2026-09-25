import { useState } from 'react';
import {
  type Insets,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { size } from '../theme/tokens.ts';

export interface TapProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  /** The drawn height, when it is under 44: the touch area is grown to 44 around it. */
  drawnHeight?: number;
}

/**
 * Everything that can be pressed. It shows the focus ring when reached by keyboard or switch
 * access (2px, 2px away, in `focus`; D77), and keeps every touch area at least 44 tall even when
 * the drawing is smaller (stage 5, section 2).
 */
export function Tap({ style, drawnHeight, hitSlop, onFocus, onBlur, ...rest }: TapProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const grow =
    drawnHeight !== undefined && drawnHeight < size.target ? (size.target - drawnHeight) / 2 : 0;
  const slop: Insets | number | null | undefined =
    hitSlop ?? (grow > 0 ? { top: grow, bottom: grow } : undefined);
  return (
    <Pressable
      {...rest}
      hitSlop={slop}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        focused && {
          outlineWidth: 2,
          outlineStyle: 'solid',
          outlineColor: colors.focus,
          outlineOffset: 2,
        },
      ]}
    />
  );
}
