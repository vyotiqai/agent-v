import { fontFiles } from '@agentv/app/src/theme/fonts.ts';
import { ThemeProvider } from '@agentv/app/src/theme/theme.tsx';
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { previews } from './previews.tsx';
import { screens } from './screens.tsx';

// Design tooling, never part of the app. The address chooses what is shown:
// ?c=Button&theme=dark, a component's preview, drawn inside #preview for compare.ts;
// ?s=Privacy&theme=dark&state=failed, a whole screen at phone size.
function Gallery() {
  const [loaded] = useFonts(fontFiles);
  const query = new URLSearchParams(globalThis.location?.search ?? '');
  const Preview = previews[query.get('c') ?? ''];
  const screen = screens[query.get('s') ?? ''];
  const theme = query.get('theme') === 'dark' ? 'dark' : 'light';
  if (!loaded || (!Preview && !screen)) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider appearance={theme}>
        {Preview ? (
          <View testID="preview" style={{ alignSelf: 'stretch' }}>
            <Preview />
          </View>
        ) : (
          <View testID="screen" style={{ width: 390, height: 844, overflow: 'hidden' }}>
            {screen?.(query.get('state'))}
          </View>
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

registerRootComponent(Gallery);
