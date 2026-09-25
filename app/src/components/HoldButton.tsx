import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { fonts, size } from '../theme/tokens.ts';
import { Icon } from './Icon.tsx';
import { Text } from './Text.tsx';

export interface HoldButtonProps {
  children: string;
  /** `blue` to act as you; `red` only for what can't be undone. */
  tone?: 'blue' | 'red';
  /** Show the Face ID mark: Spend and Can't undo also need the phone's own check (D7, D92). */
  faceId?: boolean;
  /** How long to hold, in ms (0.9 s, D78). */
  duration?: number;
  onSigned?: () => void;
  /** Shown in its place once signed. */
  done?: ReactNode;
}

// A light tap as the hold starts, a firm success when it completes, an error if it's let go early
// (stage 6, section 2). The phone may have haptics off; that is not an error.
function feel(kind: 'start' | 'done' | 'cancel'): void {
  if (Platform.OS === 'web') return;
  const run =
    kind === 'start'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
          kind === 'done'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error,
        );
  run.catch(() => {});
}

/**
 * Signing (D25): press and hold for 0.9 s to approve what the agent will do as you. It fills while
 * held; letting go early cancels. Screen reader users double-tap and hold.
 */
export function HoldButton({
  children,
  tone = 'blue',
  faceId = false,
  duration = 900,
  onSigned,
  done,
}: HoldButtonProps) {
  const { colors } = useTheme();
  const fill = useRef(new Animated.Value(0)).current;
  const [signed, setSigned] = useState(false);
  const holding = useRef(false);
  useEffect(() => () => fill.stopAnimation(), [fill]);

  const begin = () => {
    if (signed || holding.current) return;
    holding.current = true;
    feel('start');
    Animated.timing(fill, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      holding.current = false;
      if (!finished) return;
      setSigned(true);
      feel('done');
      onSigned?.();
    });
  };
  const end = () => {
    if (!holding.current) return;
    fill.stopAnimation();
    holding.current = false;
    fill.setValue(0);
    feel('cancel');
  };

  if (signed && done) return <>{done}</>;
  const [bg, fg] = tone === 'red' ? [colors.red, colors.onRed] : [colors.blue, colors.onBlue];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityHint="Double-tap and hold to sign."
      aria-disabled={signed}
      onPressIn={begin}
      onPressOut={end}
      style={{
        width: '100%',
        height: size.hold,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: bg,
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          backgroundColor: '#FFFFFF',
          opacity: 0.24,
          width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }}
      >
        <Icon name={faceId ? 'face' : 'pen'} color={fg} />
        <Text
          natural
          numberOfLines={1}
          style={{ color: fg, fontFamily: fonts.sans600, fontSize: 16 }}
        >
          {children}
        </Text>
      </View>
    </Pressable>
  );
}
