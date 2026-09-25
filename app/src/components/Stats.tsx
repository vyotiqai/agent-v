import { View } from 'react-native';
import { type as types } from '../theme/tokens.ts';
import { Text } from './Text.tsx';

export interface Stat {
  value: string;
  label: string;
}

/** A row of figures on the dark top, in equal columns with a hairline between them. */
export function Stats({ items }: { items: Stat[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 16 }}>
      {items.map((s, i) => (
        // Equal columns, as in a grid: the hairline and its space sit inside each column's share.
        <View key={s.label} style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
          <View
            accessible
            accessibilityLabel={`${s.value} ${s.label}`}
            style={[
              { gap: 4 },
              i > 0 && {
                paddingLeft: 16,
                borderLeftWidth: 1,
                borderLeftColor: 'rgba(255,255,255,0.1)',
              },
            ]}
          >
            {/* A figure is never cut short: at its full width it may reach into the space beside it. */}
            <View style={{ flexDirection: 'row' }}>
              <Text
                variant="figure"
                color="onNight"
                style={{ lineHeight: types.figure.fontSize, flexShrink: 0 }}
              >
                {s.value}
              </Text>
            </View>
            <Text variant="caption" color="onNightMuted" natural numberOfLines={1}>
              {s.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
