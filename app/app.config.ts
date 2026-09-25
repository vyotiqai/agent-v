import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * The app's configuration: app.json, plus what depends on the build. The Android package name and
 * the iPhone bundle id follow the domain (D124), which isn't chosen yet; until then they come from
 * the build's settings, and CI's compile check sets its own.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidPackage = process.env['AGENT_V_ANDROID_PACKAGE'];
  return {
    ...config,
    name: config.name ?? 'Agent V',
    slug: config.slug ?? 'agent-v',
    android: {
      ...config.android,
      ...(androidPackage ? { package: androidPackage } : {}),
    },
  };
};
