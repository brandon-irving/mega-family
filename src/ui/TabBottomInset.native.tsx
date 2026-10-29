// For a native tab with `manualInsets` (src/features/shell/tabs.ts): pads the bottom by the tab bar's own
// inset, so fixed bottom content (the chat composer) sits above iOS 26's floating tab bar. This is the
// SafeAreaView the Expo Router docs give for `disableAutomaticContentInsets`
// (docs.expo.dev/router/advanced/native-tabs → Safe area handling); it knows the tab bar's height.
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-screens/experimental';

export function TabBottomInset({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={{ bottom: true }} style={{ flex: 1 }}>
      {children}
    </SafeAreaView>
  );
}
