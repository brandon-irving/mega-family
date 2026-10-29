// Web: the tab bar is laid out in the page (src/app/(tabs)/_layout.tsx), so a tab screen needs no extra
// bottom space. The native version pads for the floating tab bar (TabBottomInset.native.tsx).
import type { ReactNode } from 'react';
import { View } from 'react-native';

export function TabBottomInset({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
