import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Tap } from '../components/Tap.tsx';
import { Text } from '../components/Text.tsx';
import { useTheme } from '../theme/theme.tsx';
import { fonts, size, space } from '../theme/tokens.ts';

export interface WelcomeProps {
  /** Opens Google's sign-in sheet; resolves with what happened. */
  onGoogle: () => Promise<
    { ok: true } | { ok: false; reason: 'cancelled' | 'no-screen-lock' | 'failed' }
  >;
}

/**
 * Welcome (stage 4, getting started): "Hand it off." and what Agent V does, then sign-in. On
 * Android at launch that is Google alone (D125), so it is the one main button. Cancelled: back
 * here, nothing said. Failed: one line under the button, with Try again.
 */
export function Welcome({ onGoogle }: WelcomeProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'failed' | 'no-screen-lock' | null>(null);

  const go = async () => {
    setBusy(true);
    setProblem(null);
    const result = await onGoogle();
    setBusy(false);
    if (!result.ok && result.reason !== 'cancelled') setProblem(result.reason);
  };

  // The drawn screen is 844 tall: the light sits 250 down and the words start at 430. On other
  // phones they keep the same proportions.
  const orbY = Math.round(height * (250 / 844));
  const wordsY = Math.round(height * (430 / 844));
  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: 0, right: 0, top: orbY - 150, alignItems: 'center' }}
      >
        <Svg width={300} height={300}>
          <Defs>
            {/* CSS's radial-gradient(circle, …) reaches the box's corners: a radius of 150 × √2. */}
            <RadialGradient id="orb" cx="50%" cy="50%" r="70.71%">
              <Stop offset="0" stopColor="rgb(111,136,255)" stopOpacity={0.55} />
              <Stop offset="0.4" stopColor="rgb(51,85,255)" stopOpacity={0.25} />
              <Stop offset="0.7" stopColor="rgb(51,85,255)" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={300} height={300} fill="url(#orb)" />
        </Svg>
        <View
          style={{
            position: 'absolute',
            top: 150 - 44,
            width: 88,
            height: 88,
            borderRadius: 28,
            backgroundColor: colors.onNight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Svg width={46} height={46} viewBox="0 0 24 24" fill="none">
            <Path
              d="m7 8 5 9 5-9"
              stroke={colors.night}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </View>

      <View
        style={{ position: 'absolute', left: space[24], right: space[24], top: wordsY, gap: 12 }}
      >
        <Text
          accessibilityRole="header"
          color="onNight"
          style={{ fontFamily: fonts.sans500, fontSize: 48, lineHeight: 48, letterSpacing: -1.92 }}
        >
          Hand it off.
        </Text>
        <Text color="onNightMuted" style={{ fontSize: 17, lineHeight: 24.65 }}>
          Tell me what you want done. I plan it, work on it around the clock, and bring you only
          what needs you.
        </Text>
      </View>

      <View
        style={{
          position: 'absolute',
          left: space[16],
          right: space[16],
          bottom: space[28] + insets.bottom,
          gap: 8,
        }}
      >
        <Tap
          accessibilityRole="button"
          aria-disabled={busy}
          disabled={busy}
          onPress={go}
          style={{
            height: size.button,
            borderRadius: 999,
            backgroundColor: colors.onNight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text natural style={{ color: colors.night, fontFamily: fonts.sans600, fontSize: 16 }}>
            Continue with Google
          </Text>
        </Tap>
        {problem ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}
          >
            {problem === 'failed' ? (
              <>
                <Text variant="small" color="onNight" natural>
                  Couldn’t sign in with Google ·{' '}
                </Text>
                <Tap accessibilityRole="button" onPress={go} drawnHeight={20}>
                  <Text
                    variant="small"
                    color="onNight"
                    natural
                    style={{ textDecorationLine: 'underline' }}
                  >
                    Try again
                  </Text>
                </Tap>
              </>
            ) : (
              <Text variant="small" color="onNight" style={{ textAlign: 'center' }}>
                Set a screen lock on this phone first. Agent V uses it when you sign for something.
              </Text>
            )}
          </View>
        ) : null}
        <Text variant="micro" color="onNightMuted" natural style={{ textAlign: 'center' }}>
          By continuing you agree to the Terms and the Privacy Policy.
        </Text>
      </View>
    </View>
  );
}
