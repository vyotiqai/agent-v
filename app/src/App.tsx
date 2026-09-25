import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Component, type ReactNode, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from './auth/session.tsx';
import { Problem } from './components/Problem.tsx';
import { Privacy, type PrivacySource } from './screens/Privacy.tsx';
import { Welcome } from './screens/Welcome.tsx';
import { fontFiles } from './theme/fonts.ts';
import { ThemeProvider, useTheme } from './theme/theme.tsx';

// The splash screen stays up until the fonts are ready and the app knows whether this phone is
// signed in, so nothing is drawn in the wrong face or on the wrong screen.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * The app: fonts, the theme following the phone (D69), safe areas, the session, and a last line of
 * defence for errors. Screens arrive with the slices that make them work (stage 7). Slice 1: signed
 * out, Welcome; signed in, Privacy and your data (D138).
 */
export default function App() {
  const [loaded, error] = useFonts(fontFiles);
  if (!loaded && error === null) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { colors } = useTheme();
  const session = useSession();
  useEffect(() => {
    // The window behind the app matches the ground, so nothing flashes white in dark.
    SystemUI.setBackgroundColorAsync(colors.ground).catch(() => {});
  }, [colors.ground]);
  useEffect(() => {
    if (session.status !== 'starting') SplashScreen.hideAsync().catch(() => {});
  }, [session.status]);
  const source = useMemo<PrivacySource>(
    () => ({
      phones: () => session.api.phones(),
      signOutPhone: (id) => session.api.signOutPhone(id),
      signOut: () => session.signOut(),
    }),
    [session],
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      {/* Every screen so far starts with a dark top, so the status bar is light. */}
      <StatusBar style="light" />
      <Guard>
        {session.status === 'signed-out' ? <Welcome onGoogle={session.signIn} /> : null}
        {session.status === 'signed-in' ? <Privacy source={source} /> : null}
      </Guard>
    </View>
  );
}

/** If drawing a screen fails, say so plainly instead of leaving a blank or frozen app. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 12 }}>
        <Problem
          title="Something went wrong on this screen"
          detail="Close Agent V and open it again. Your jobs keep running on the server."
        />
      </View>
    );
  }
}
