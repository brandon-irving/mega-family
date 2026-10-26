import 'tsx/cjs'; // lets this file import the shared TypeScript config
import type { ExpoConfig } from 'expo/config';
import { IDENTITY } from './shared/config/identity.ts';
import { THEMES } from './shared/config/theme.ts';

// PLAN.md → Sign-in: Google sign-in on iOS needs its reversed client id as a URL scheme
// (`com.googleusercontent.apps.<id>`), the same value Google's GoogleService-Info.plist calls
// REVERSED_CLIENT_ID. Derived here from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID so it's never hand-copied
// and out of sync; returns null (and the plugin is simply omitted) when the var isn't set yet, so
// `npx expo start`/`expo export` still work before Google OAuth is configured.
function googleIosUrlScheme(clientId: string | undefined): string | null {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId || !clientId.endsWith(suffix)) return null;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

const googleIosScheme = googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
const googleSignInPlugin: [string, { iosUrlScheme: string }] | null = googleIosScheme
  ? ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosScheme }]
  : null;

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
    // Only standard encryption (HTTPS/TLS, Keychain via expo-secure-store): exempt from export rules.
    config: { usesNonExemptEncryption: false },
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
    'expo-secure-store',
    'expo-apple-authentication',
    ...(googleSignInPlugin ? [googleSignInPlugin] : []),
    ['expo-splash-screen', { backgroundColor: THEMES.midnight.bg, image: './assets/images/splash-icon.png', imageWidth: 76 }],
    // Native modules for later gates, included now so the phone's development build doesn't need rebuilding
    // at each gate: push (G3), talk mode audio + spoken replies (G4), device calendar import (G5), photos (G5).
    // react-native-keyboard-controller and expo-haptics need no plugin entry; widgets (G8) will need one more build.
    'expo-dev-client',
    ['expo-notifications', { color: THEMES.midnight.accent, enableRemoteNotifications: true }],
    ['expo-audio', { microphonePermission: `${IDENTITY.name} listens only while you hold the Talk button.`, enableBackgroundRecording: false }],
    ['expo-calendar', { calendarPermission: `${IDENTITY.name} can add your calendars' events to the family calendar.` }],
    ['expo-image-picker', { photosPermission: `${IDENTITY.name} uses the photos you pick for chat and wallpapers.`, cameraPermission: `${IDENTITY.name} uses the camera when you take a photo to share.` }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: { eas: { projectId: IDENTITY.easProjectId } },
};

export default config;
