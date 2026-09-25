import { View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { radius } from '../theme/tokens.ts';
import { Breathing } from './motion.tsx';

/** A job's progress as segments: done ones in `ink`; the current one breathes while it's live. */
export function Steps({
  total,
  done,
  live = false,
}: {
  total: number;
  done: number;
  live?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Step ${Math.min(done + 1, total)} of ${total}`}
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {Array.from({ length: total }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a segment is its position; there is nothing else to key it by
        <Breathing key={i} on={live && i === done} style={{ flex: 1 }}>
          <View
            style={{
              height: 4,
              borderRadius: radius.bar,
              backgroundColor: i < done ? colors.ink : colors.line,
            }}
          />
        </Breathing>
      ))}
    </View>
  );
}

/** A share of a whole, such as storage used, from 0 to 100. */
export function Meter({ value }: { value: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${pct}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      style={{ height: 6, borderRadius: 999, backgroundColor: colors.line, overflow: 'hidden' }}
    >
      <View
        style={{ width: `${pct}%`, height: '100%', borderRadius: 999, backgroundColor: colors.ink }}
      />
    </View>
  );
}
