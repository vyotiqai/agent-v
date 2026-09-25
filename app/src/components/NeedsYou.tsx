import { View } from 'react-native';
import type { IconName } from '../theme/icons.ts';
import { useTheme } from '../theme/theme.tsx';
import { fonts, radius, size } from '../theme/tokens.ts';
import { Icon } from './Icon.tsx';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

export interface NeedsYouChip {
  icon: IconName;
  label: string;
  onPress?: () => void;
}

export interface NeedsYouProps {
  title: string;
  /** What it will do: "Sends an email as you". */
  detail?: string;
  /** "1 of 3" when more are waiting. */
  count?: string;
  icon?: IconName;
  /** The other items waiting, as chips. */
  chips?: NeedsYouChip[];
  onOpen?: () => void;
}

/** The blue block at the top of Today: the one thing that needs you now. */
export function NeedsYou({
  title,
  detail,
  count,
  icon = 'pen',
  chips = [],
  onOpen,
}: NeedsYouProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel="Needs you"
      style={{ padding: 20, borderRadius: radius.block, backgroundColor: colors.blue }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: size.mark,
            height: size.mark,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={18} color={colors.onBlue} />
        </View>
        <Text
          accessibilityRole="header"
          color="onBlueMuted"
          natural
          style={{ flex: 1, fontFamily: fonts.sans500, fontSize: 14 }}
        >
          {count ? `Needs you · ${count}` : 'Needs you'}
        </Text>
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Open: ${title}`}
          onPress={onOpen}
          style={{
            width: size.target,
            height: size.target,
            borderRadius: 999,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="up_right" color="#111113" />
        </Tap>
      </View>
      <Text variant="title2" color="onBlue" style={{ marginTop: 14 }}>
        {title}
      </Text>
      {detail ? (
        <Text color="onBlueMuted" style={{ marginTop: 6, fontSize: 14, lineHeight: 19.6 }}>
          {detail}
        </Text>
      ) : null}
      {chips.length > 0 ? (
        <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((c) => (
            <Tap
              key={c.label}
              accessibilityRole="button"
              onPress={c.onPress}
              drawnHeight={34}
              style={{
                height: 34,
                paddingLeft: 10,
                paddingRight: 12,
                borderRadius: 999,
                backgroundColor: colors.blueDeep,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Icon name={c.icon} size={15} color={colors.onBlue} />
              <Text color="onBlue" natural style={{ fontFamily: fonts.sans500, fontSize: 13 }}>
                {c.label}
              </Text>
            </Tap>
          ))}
        </View>
      ) : null}
    </View>
  );
}
