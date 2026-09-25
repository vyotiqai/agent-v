import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IconName } from '../theme/icons.ts';
import { useTheme } from '../theme/theme.tsx';
import { size } from '../theme/tokens.ts';
import { Icon } from './Icon.tsx';
import { Mark, type MarkProps } from './Mark.tsx';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

export interface RowProps {
  title: string;
  detail?: string;
  /** Blue for a signature, red for can't be undone, green for working: the words say it too. */
  detailTone?: 'blue' | 'red' | 'green';
  icon?: IconName;
  markTone?: MarkProps['tone'];
  /** Something other than a mark at the start. */
  lead?: ReactNode;
  /** Something at the end, such as a small button; a chevron is shown when the row opens something. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** A hairline above; Block sets it on every row after the first. */
  separator?: boolean;
  /** `settings` rows are 56 tall rather than 62 (stage 5, section 4). */
  size?: 'block' | 'settings';
}

/** One line in a block: a mark, a title and a detail, and where it leads. */
export function Row({
  title,
  detail,
  detailTone,
  icon,
  markTone,
  lead,
  trailing,
  onPress,
  separator = false,
  size: rowSize = 'block',
}: RowProps) {
  const { colors } = useTheme();
  const detailColor = detailTone
    ? { blue: colors.blueText, red: colors.redText, green: colors.greenText }[detailTone]
    : colors.inkMuted;
  const body = (
    <>
      {icon ? <Mark icon={icon} {...(markTone ? { tone: markTone } : {})} /> : (lead ?? null)}
      <View style={{ flex: 1, minWidth: 0, gap: rowSize === 'settings' ? 1 : 2 }}>
        <Text variant="row" natural numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" natural numberOfLines={1} style={{ color: detailColor }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing !== undefined ? (
        trailing
      ) : onPress ? (
        <Icon name="chevron" size={18} color={colors.inkMuted} />
      ) : null}
    </>
  );
  const style = {
    minHeight: rowSize === 'settings' ? 56 : size.row,
    paddingVertical: rowSize === 'settings' ? 8 : 10,
    borderTopWidth: separator ? 1 : 0,
    borderTopColor: colors.line,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  };
  return onPress ? (
    <Tap accessibilityRole="button" onPress={onPress} style={style}>
      {body}
    </Tap>
  ) : (
    <View style={style}>{body}</View>
  );
}
