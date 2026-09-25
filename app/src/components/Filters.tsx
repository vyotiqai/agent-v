import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { fonts } from '../theme/tokens.ts';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

export interface FiltersProps {
  /** The group's name, for screen readers. */
  label: string;
  /** One word each. */
  options: string[];
  value?: number;
  defaultValue?: number;
  onChange?: (index: number) => void;
}

/** Pills on the dark top that narrow what's below. The chosen one is light on dark. */
export function Filters({ label, options, value, defaultValue = 0, onChange }: FiltersProps) {
  const { colors } = useTheme();
  const [own, setOwn] = useState(defaultValue);
  const chosen = value ?? own;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
    >
      {options.map((o, i) => {
        const on = i === chosen;
        return (
          <Tap
            key={o}
            accessibilityRole="tab"
            aria-selected={on}
            drawnHeight={34}
            onPress={() => {
              setOwn(i);
              onChange?.(i);
            }}
            style={{
              height: 34,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: on ? colors.onNight : colors.glass,
              justifyContent: 'center',
            }}
          >
            <Text
              natural
              numberOfLines={1}
              style={{
                fontFamily: fonts.sans500,
                fontSize: 14,
                color: on ? colors.night : colors.onNight,
              }}
            >
              {o}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}
