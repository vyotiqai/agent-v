/**
 * The build's settings (see env.d.ts). Written as `process.env.EXPO_PUBLIC_…` in full, which is how
 * Expo finds and fills them in at build time.
 */
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
};
