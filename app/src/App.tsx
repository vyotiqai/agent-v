import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Component, type ReactNode, useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Problem } from './components/Problem.tsx';
import { fontFiles } from './theme/fonts.ts';
import { ThemeProvider, useTheme } from './theme/theme.tsx';

// The splash screen stays up until the fonts are ready, so no text is drawn in the wrong face.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * The app shell (slice 0): fonts, the theme following the phone (D69), safe areas, and a last line
 * of defence for errors. Screens arrive with the slices that make them work (stage 7): a screen
 * whose slice hasn't come yet is not in the app.
 */
export default function App() {
  const [loaded, error] = useFonts(fontFiles);
  const ready = loaded || error !== null;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { name, colors } = useTheme();
  useEffect(() => {
    // The window behind the app matches the ground, so nothing flashes white in dark.
    SystemUI.setBackgroundColorAsync(colors.ground).catch(() => {});
  }, [colors.ground]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Guard>{null}</Guard>
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
