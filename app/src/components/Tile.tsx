import { createContext, type ReactNode, useContext } from 'react';
import { View } from 'react-native';
import type { IconName } from '../theme/icons.ts';
import { useTheme } from '../theme/theme.tsx';
import { radius } from '../theme/tokens.ts';
import { Mark } from './Mark.tsx';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

const Dark = createContext(false);

export interface TileProps {
  icon: IconName;
  status: string;
  title: string;
  /** For a watch or a routine, to tell them from jobs at a glance. */
  dark?: boolean;
  onPress?: () => void;
  /** The bottom: Steps, or a TileFigure and a TileNote. */
  children?: ReactNode;
}

/** A square-ish summary of one job on Today: its state, its name, and one number or progress. */
export function Tile({ icon, status, title, dark = false, onPress, children }: TileProps) {
  const { colors } = useTheme();
  return (
    <Dark value={dark}>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${status}`}
        onPress={onPress}
        style={{
          height: 150,
          paddingVertical: 16,
          paddingHorizontal: 18,
          borderRadius: radius.block,
          backgroundColor: dark ? colors.night2 : colors.surface,
          justifyContent: 'space-between',
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Mark icon={icon} tone={dark ? 'night' : 'plain'} />
          <Text
            variant="caption"
            color={dark ? 'onNightMuted' : 'inkMuted'}
            natural
            numberOfLines={1}
          >
            {status}
          </Text>
        </View>
        <Text variant="headline" color={dark ? 'onNight' : 'ink'} numberOfLines={2}>
          {title}
        </Text>
        {children}
      </Tap>
    </Dark>
  );
}

/** A tile's one figure. */
export function TileFigure({ children }: { children: string }) {
  const dark = useContext(Dark);
  return (
    <Text
      variant="title2"
      color={dark ? 'onNight' : 'ink'}
      numberOfLines={1}
      style={{ lineHeight: 26.4 }}
    >
      {children}
    </Text>
  );
}

/** A tile's short note under the figure. */
export function TileNote({ children }: { children: string }) {
  const dark = useContext(Dark);
  return (
    <Text variant="caption" color={dark ? 'onNightMuted' : 'inkMuted'} natural numberOfLines={1}>
      {children}
    </Text>
  );
}
