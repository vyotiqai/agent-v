import { View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { radius } from '../theme/tokens.ts';
import { Breathing } from './motion.tsx';

/** A line of a skeleton: [width, height] with width in %, or [width, height, true] in px. */
export type SkeletonLine = readonly [number, number] | readonly [number, number, true];

const DEFAULT_LINES: SkeletonLine[] = [
  [36, 36, true],
  [78, 18],
  [46, 12],
];

/** Grey shapes while a screen loads for the first time (D55); they breathe unless Reduce Motion. */
export function Skeleton({
  label = 'Loading',
  lines = DEFAULT_LINES,
}: {
  label?: string;
  lines?: SkeletonLine[];
}) {
  const { colors } = useTheme();
  return (
    <Breathing>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        style={{
          padding: 20,
          borderRadius: radius.block,
          backgroundColor: colors.surface,
          gap: 10,
        }}
      >
        {lines.map((l, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: a line is its position; the list never changes order
            key={i}
            style={{
              width: l[2] ? l[0] : `${l[0]}%`,
              height: l[1],
              borderRadius: 999,
              backgroundColor: colors.skeleton,
            }}
          />
        ))}
      </View>
    </Breathing>
  );
}
