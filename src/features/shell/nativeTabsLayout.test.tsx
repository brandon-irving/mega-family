// Owner device test, Oct 29 (iPhone, iOS 26): the chat composer sat under the floating Liquid Glass tab bar
// and the inverted message list looked dimmed until scrolled. Native tabs give the FIRST ScrollView of a tab
// automatic content insets (docs.expo.dev/router/advanced/native-tabs → Safe area handling); the chat's first
// ScrollView is the inverted list, and the composer below it gets no inset at all. The chat tab opts out
// (`disableAutomaticContentInsets`) and pads its own bottom (src/ui/TabBottomInset). Also: the tabs
// ErrorBoundary existed only in the web layout, so on the phone a throwing tab screen had no boundary.
import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import * as NativeLayout from '@/app/(tabs)/_layout.native';
import * as WebLayout from '@/app/(tabs)/_layout.tsx';
import { TAB_META } from './tabs';

const mockTriggers: Record<string, unknown>[] = [];
jest.mock('@/ui/theme', () => ({ ...jest.requireActual('@/ui/theme'), useTheme: () => ({ role: 'admin' }) }));
jest.mock('expo-router/native-tabs', () => {
  const Trigger = (props: Record<string, unknown> & { children?: ReactNode }) => {
    mockTriggers.push(props);
    return null;
  };
  Trigger.Label = function Label() {
    return null;
  };
  Trigger.Icon = function Icon() {
    return null;
  };
  const NativeTabs = ({ children }: { children: ReactNode }) => <>{children}</>;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

test('fixed viewport tabs own their insets while the scrollable Family tab uses automatic insets', async () => {
  mockTriggers.length = 0;
  await render(<NativeLayout.default />);
  const byName = Object.fromEntries(mockTriggers.map((t) => [t.name as string, t]));
  expect(byName[TAB_META.chat.route].disableAutomaticContentInsets).toBe(true);
  expect(byName[TAB_META.ideas.route].disableAutomaticContentInsets).toBe(true);
  expect(byName[TAB_META.hq.route].disableAutomaticContentInsets).toBe(true);
  expect(byName[TAB_META.family.route].disableAutomaticContentInsets).toBeFalsy();
});

test('the native tabs layout exports the same ErrorBoundary as the web one', () => {
  const web = WebLayout;
  expect(typeof (NativeLayout as { ErrorBoundary?: unknown }).ErrorBoundary).toBe('function');
  expect((NativeLayout as { ErrorBoundary?: unknown }).ErrorBoundary).toBe(web.ErrorBoundary);
});
