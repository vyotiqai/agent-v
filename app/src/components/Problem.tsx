import { View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { radius } from '../theme/tokens.ts';
import { Button } from './Button.tsx';
import { Mark } from './Mark.tsx';
import { Text } from './Text.tsx';

export interface ProblemProps {
  /** What didn't work, plainly. */
  title: string;
  /** Why, and what still works. */
  detail: string;
  /** The support reference (D98), such as S-4F2A. */
  reference?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** Something that didn't work, in place of what should be there, with a way to try again. */
export function Problem({
  title,
  detail,
  reference,
  onRetry,
  retryLabel = 'Try again',
}: ProblemProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{ padding: 18, borderRadius: radius.block, backgroundColor: colors.surface, gap: 14 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Mark icon="alert" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="row" natural>
            {title}
          </Text>
          <Text variant="caption" color="inkMuted" style={{ lineHeight: 18.2 }}>
            {detail}
          </Text>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 48,
        }}
      >
        {onRetry ? (
          <Button variant="small" onPress={onRetry}>
            {retryLabel}
          </Button>
        ) : (
          <View />
        )}
        {reference ? (
          <Text variant="micro" color="inkMuted" natural selectable>
            {`Ref. ${reference}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
