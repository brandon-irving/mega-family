import 'tsx/cjs'; // lets this file import the shared TypeScript config
import type { ExpoConfig } from 'expo/config';
import { IDENTITY } from './shared/config/identity.ts';
import { THEMES } from './shared/config/theme.ts';

const config: ExpoConfig = {
  name: IDENTITY.name,
  slug: IDENTITY.slug,
  owner: IDENTITY.expoOwner,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: IDENTITY.scheme,
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/expo.icon',
    bundleIdentifier: IDENTITY.bundleId,
    usesAppleSignIn: true,
  },
  android: {
    package: IDENTITY.bundleId,
    adaptiveIcon: {
      backgroundColor: THEMES.midnight.bg,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: { output: 'server', favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: THEMES.midnight.bg, image: './assets/images/splash-icon.png', imageWidth: 76 }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: { eas: { projectId: IDENTITY.easProjectId } },
};

export default config;
