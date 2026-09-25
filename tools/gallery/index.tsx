import { fontFiles } from '@agentv/app/src/theme/fonts.ts';
import { ThemeProvider } from '@agentv/app/src/theme/theme.tsx';
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { previews } from './previews.tsx';

// Design tooling, never part of the app: shows one component's preview, chosen by the address:
// ?c=Button&theme=dark. The preview is drawn inside #preview, the element compare.js photographs.
function Gallery() {
  const [loaded] = useFonts(fontFiles);
  const query = new URLSearchParams(globalThis.location?.search ?? '');
  const Preview = previews[query.get('c') ?? ''];
  const theme = query.get('theme') === 'dark' ? 'dark' : 'light';
  if (!loaded || !Preview) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider appearance={theme}>
        <View testID="preview" style={{ alignSelf: 'stretch' }}>
          <Preview />
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

registerRootComponent(Gallery);
