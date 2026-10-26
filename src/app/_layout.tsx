import { KeyboardProvider } from 'react-native-keyboard-controller';
import { DataProvider } from '@/data/client';
import { AppThemeProvider } from '@/features/shell/AppThemeProvider';
import { AuthGate } from '@/features/shell/AuthGate';
import { NavigationThemeBridge } from '@/features/shell/NavigationThemeBridge';

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
