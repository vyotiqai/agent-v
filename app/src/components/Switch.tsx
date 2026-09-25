import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { useReduceMotion } from './motion.tsx';
import { Tap } from './Tap.tsx';

export interface SwitchProps {
  /** Read by screen readers; the row beside it shows it too. */
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
}

/**
 * An on/off setting that applies at once. Off has a visible edge (`control-off`, 3:1), so its
 * state never depends on colour alone. The knob slides in 160 ms, or jumps with Reduce Motion.
 */
export function Switch({ label, checked, defaultChecked = false, onChange }: SwitchProps) {
  const { colors, shadows } = useTheme();
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  const reduce = useReduceMotion();
  const x = useRef(new Animated.Value(on ? 23 : 3)).current;
  useEffect(() => {
    if (reduce) x.setValue(on ? 23 : 3);
    else
      Animated.timing(x, { toValue: on ? 23 : 3, duration: 160, useNativeDriver: false }).start();
  }, [on, reduce, x]);
  return (
    <Tap
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={on}
      drawnHeight={32}
      onPress={() => {
        setOwn(!on);
        onChange?.(!on);
      }}
      style={{ width: 52, height: 32, borderRadius: 999 }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          borderRadius: 999,
          backgroundColor: on ? colors.ink : colors.lineStrong,
          borderWidth: on ? 0 : 1.5,
          borderColor: colors.controlOff,
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          top: 3,
          left: x,
          width: 26,
          height: 26,
          borderRadius: 999,
          backgroundColor: on ? colors.onInk : '#FFFFFF',
          boxShadow: shadows.knob,
        }}
      />
    </Tap>
  );
}
