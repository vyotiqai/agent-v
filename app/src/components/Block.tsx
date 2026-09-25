import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { fonts, radius } from '../theme/tokens.ts';
import { Row, type RowProps } from './Row.tsx';
import { Text } from './Text.tsx';

/**
 * A white block on the ground, holding rows under an optional label. Rows after the first get a
 * hairline above them.
 */
export function Block({ label, children }: { label?: string; children?: ReactNode }) {
  const { colors } = useTheme();
  let rows = 0;
  const items = Children.map(children, (child) => {
    if (isValidElement<RowProps>(child) && child.type === Row) {
      rows += 1;
      return rows > 1 ? cloneElement(child, { separator: true }) : child;
    }
    return child;
  });
  return (
    <View
      accessibilityLabel={label}
      style={{
        paddingTop: 12,
        paddingHorizontal: 18,
        paddingBottom: 4,
        borderRadius: radius.block,
        backgroundColor: colors.surface,
      }}
    >
      {label ? (
        <Text
          variant="caption"
          color="inkMuted"
          natural
          accessibilityRole="header"
          style={{ marginBottom: 2, fontFamily: fonts.sans500 }}
        >
          {label}
        </Text>
      ) : null}
      {items}
    </View>
  );
}
