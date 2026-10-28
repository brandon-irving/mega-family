// G3 "APP KILLED" handling: must be imported first and at module scope (not inside a component) — the
// background notification task (src/services/backgroundNotificationTask.ts) has to be defined and
// registered before any screen renders, per expo-notifications' own docs on where this can safely run.
import '@/services/backgroundNotificationTask';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { DataProvider } from '@/data/client';
import { AppThemeProvider } from '@/features/shell/AppThemeProvider';
import { AuthGate } from '@/features/shell/AuthGate';
import { NavigationThemeBridge } from '@/features/shell/NavigationThemeBridge';

// While any route is still loading, show the walking-MEGA loader instead of an empty frame (owner, Oct 28).
export { RouteLoading as SuspenseFallback } from '@/features/shell/RouteLoading';

export default function RootLayout() {
  return (
    // KeyboardProvider (react-native-keyboard-controller) wraps the whole app so every screen can use
    // its KeyboardAvoidingView/KeyboardStickyView for a composer that stays above the keyboard with a
    // smooth, native-driven animation instead of RN core's KeyboardAvoidingView (which jumps on Android
    // and over-shoots on iOS with nested navigators). Needs the native module, so it ships with the dev
    // client build already — see the G2 report.
    <KeyboardProvider>
      <DataProvider>
        <AppThemeProvider>
          <NavigationThemeBridge>
            <AuthGate />
          </NavigationThemeBridge>
        </AppThemeProvider>
      </DataProvider>
    </KeyboardProvider>
  );
}
