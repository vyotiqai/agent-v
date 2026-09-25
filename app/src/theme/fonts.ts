import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { fonts } from './tokens.ts';

/**
 * Geist and Geist Mono (D75; SIL Open Font License), bundled with the app, registered under the
 * names the type styles use. Loaded while the splash screen shows, so no text is drawn before them.
 */
export const fontFiles = {
  [fonts.sans400]: Geist_400Regular,
  [fonts.sans500]: Geist_500Medium,
  [fonts.sans600]: Geist_600SemiBold,
  [fonts.mono400]: GeistMono_400Regular,
};
