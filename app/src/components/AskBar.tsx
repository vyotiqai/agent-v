import { View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { size } from '../theme/tokens.ts';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

export interface AskBarProps {
  placeholder?: string;
  onOpen?: () => void;
  onAttach?: () => void;
  onSpeak?: () => void;
}

/** The hand-off line, floating at the bottom of main screens: attach, write, or speak. */
export function AskBar({
  placeholder = 'Hand something off…',
  onOpen,
  onAttach,
  onSpeak,
}: AskBarProps) {
  const { colors, shadows } = useTheme();
  return (
    <View
      style={{
        height: 60,
        paddingHorizontal: 8,
        borderRadius: 999,
        backgroundColor: colors.bar,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        boxShadow: shadows.bar,
      }}
    >
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Attach a photo, file or link"
        onPress={onAttach}
        style={{
          width: size.target,
          height: size.target,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.1)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="plus" color={colors.onBar} />
      </Tap>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        onPress={onOpen}
        style={{
          flex: 1,
          minWidth: 0,
          height: size.target,
          paddingLeft: 8,
          justifyContent: 'center',
        }}
      >
        <Text color="onBarMuted" natural numberOfLines={1} style={{ fontSize: 16 }}>
          {placeholder}
        </Text>
      </Tap>
      <IconButton icon="mic" label="Speak" tone="blue" onPress={onSpeak} />
    </View>
  );
}
