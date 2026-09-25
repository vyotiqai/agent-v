import { View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { fonts, radius } from '../theme/tokens.ts';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

/**
 * The bar that says what just happened, with Undo (D65). The screen shows it for 5 seconds; things
 * that happen at once are always undoable this way instead of asking first.
 */
export function UndoBar({ children, onUndo }: { children: string; onUndo?: () => void }) {
  const { colors, shadows } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        minHeight: 52,
        paddingVertical: 8,
        paddingRight: 8,
        paddingLeft: 18,
        borderRadius: radius.inset,
        backgroundColor: colors.toast,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        boxShadow: shadows.toast,
      }}
    >
      <Text color="onToast" style={{ flex: 1, fontSize: 14, lineHeight: 18.9 }}>
        {children}
      </Text>
      {onUndo ? (
        <Tap
          accessibilityRole="button"
          onPress={onUndo}
          drawnHeight={36}
          style={{
            height: 36,
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.12)',
            justifyContent: 'center',
          }}
        >
          <Text color="onToast" natural style={{ fontFamily: fonts.sans600, fontSize: 14 }}>
            Undo
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}
