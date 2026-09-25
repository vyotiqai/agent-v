import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/** True while the phone's Reduce Motion setting is on (D78). */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduce(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * Something happening now breathes: opacity from 1 to 0.3 and back over 1.6 s (D78). With Reduce
 * Motion on, it stays still.
 */
export function Breathing({
  on = true,
  style,
  children,
}: {
  on?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on || reduce) {
      opacity.setValue(1);
      return;
    }
    const half = { duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true };
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { ...half, toValue: 0.3 }),
        Animated.timing(opacity, { ...half, toValue: 1 }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, reduce, opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}
