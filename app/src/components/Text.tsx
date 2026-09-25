import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { type ColorName, type TypeStyle, type as types } from '../theme/tokens.ts';

export interface TextProps extends RNTextProps {
  /** One of the 17 type styles (stage 5, section 3). */
  variant?: TypeStyle;
  /** A colour token; ink by default. */
  color?: ColorName;
  /**
   * Use the font's own line height instead of the style's, as the design system's components do
   * for single-line labels (buttons, chips, row titles). About 1.3 times the size for Geist.
   */
  natural?: boolean;
}

/**
 * All text in the app. Numbers are tabular everywhere, and text follows the phone's text size, so
 * rows grow rather than cut (stage 5, section 2).
 */
export function Text({
  variant = 'body',
  color = 'ink',
  natural = false,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const { lineHeight, ...face } = types[variant];
  const base: TextStyle = {
    ...face,
    ...(natural ? {} : { lineHeight }),
    color: colors[color],
    fontVariant: ['tabular-nums'],
  };
  return <RNText {...rest} style={[base, style]} />;
}
