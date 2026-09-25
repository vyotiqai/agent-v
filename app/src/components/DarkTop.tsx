import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme.tsx';
import { radius, size, space } from '../theme/tokens.ts';
import { Text } from './Text.tsx';

export interface DarkTopProps {
  /** Usually an IconButton (Back); a 44px space when left out, so the chip stays centred. */
  leading?: ReactNode;
  chip?: ReactNode;
  trailing?: ReactNode;
  title?: string;
  sub?: string;
  /** The soft blue light at the top right; on by default. */
  glow?: boolean;
  children?: ReactNode;
}

/**
 * The dark top of every main screen (stage 5): white on `night`, its bottom corners rounded, with
 * the soft blue light at the top right. Its content starts 58 below the top of the screen, or
 * below the phone's status bar where that is taller.
 */
export function DarkTop({
  leading,
  chip,
  trailing,
  title,
  sub,
  glow = true,
  children,
}: DarkTopProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const spacer = <View style={{ width: size.target, flexShrink: 0 }} />;
  return (
    <View
      accessibilityRole="header"
      onLayout={(e) => setBox(e.nativeEvent.layout)}
      style={{
        paddingTop: Math.max(space[58], insets.top + space[12]),
        paddingHorizontal: space[24],
        paddingBottom: space[24],
        borderBottomLeftRadius: radius.sheet,
        borderBottomRightRadius: radius.sheet,
        backgroundColor: colors.night,
        overflow: 'hidden',
      }}
    >
      {glow && box.width > 0 ? (
        <Svg
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, top: 0 }}
          width={box.width}
          height={box.height}
        >
          <Defs>
            {/* radial-gradient(70% 60% at 100% 0%, glow, transparent) */}
            <RadialGradient id="glow" cx="100%" cy="0%" rx="70%" ry="60%" fx="100%" fy="0%">
              <Stop offset="0" stopColor={colors.glow} />
              <Stop offset="1" stopColor="rgb(51,85,255)" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={box.width} height={box.height} fill="url(#glow)" />
        </Svg>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space[12],
        }}
      >
        {leading ?? spacer}
        {chip ?? null}
        {trailing ?? spacer}
      </View>
      {title ? (
        <Text variant="title" color="onNight" accessibilityRole="header" style={{ marginTop: 22 }}>
          {title}
        </Text>
      ) : null}
      {sub ? (
        <Text variant="sub" color="onNightMuted" style={{ marginTop: space[8] }}>
          {sub}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
