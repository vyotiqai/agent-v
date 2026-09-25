import { View } from 'react-native';
import { useTheme } from '../theme/theme.tsx';
import { fonts, radius } from '../theme/tokens.ts';
import { Tap } from './Tap.tsx';
import { Text } from './Text.tsx';

export interface ConfirmProps {
  /** The question: "Disconnect Gmail?" */
  title: string;
  /** Exactly what will pause or be lost. */
  detail?: string;
  /** The verb again: Disconnect. */
  confirmLabel: string;
  cancelLabel?: string;
  /** For deleting. */
  danger?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

/** A question asked in place, for things that are hard to undo but aren't a signature. */
export function Confirm({
  title,
  detail,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const { colors } = useTheme();
  const button = (label: string, bg: string, fg: string, onPress?: () => void) => (
    <Tap
      accessibilityRole="button"
      onPress={onPress}
      drawnHeight={34}
      style={{
        height: 34,
        paddingHorizontal: 13,
        borderRadius: 999,
        backgroundColor: bg,
        justifyContent: 'center',
      }}
    >
      <Text
        natural
        numberOfLines={1}
        style={{ color: fg, fontFamily: fonts.sans500, fontSize: 13 }}
      >
        {label}
      </Text>
    </Tap>
  );
  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={title}
      style={{ padding: 14, borderRadius: radius.inset, backgroundColor: colors.surface2, gap: 10 }}
    >
      <Text style={{ fontSize: 14, lineHeight: 19.6 }}>
        <Text style={{ fontFamily: fonts.sans600, fontSize: 14, lineHeight: 19.6 }}>{title}</Text>
        {detail ? ` ${detail}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {button(cancelLabel, colors.surface, colors.ink, onCancel)}
        {danger
          ? button(confirmLabel, colors.red, colors.onRed, onConfirm)
          : button(confirmLabel, colors.ink, colors.onInk, onConfirm)}
      </View>
    </View>
  );
}
