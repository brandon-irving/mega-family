// Regression test: a real sign-in redirect to /chat on web crashed with "Too many re-renders. React
// limits the number of renders to prevent an infinite loop." (component stack: ChatLayout -> Slot ->
// TabLayout). Root cause: React Navigation's Stack/theme machinery reacts to `screenOptions`/theme VALUE
// IDENTITY, not just contents — `useThemedStackOptions` (./stackOptions.ts) built a fresh options object
// every render, and `NavigationThemeBridge` built a fresh theme object every render; each triggered
// `navigation.setOptions`, which re-rendered the component that built a new object again. Both are now
// memoized. This exercises the REAL src/app/(tabs)/_layout.tsx (the web Tabs/TabList/TabSlot rewrite
// named in the crash's component stack) and the REAL src/app/(tabs)/chat/_layout.tsx Stack together, with
// Convex-backed leaf screens stubbed out, and asserts the tree renders once without throwing.
//
// Deliberately NOT placed under src/app/ (even though it exercises files there): Expo Router's Metro
// plugin treats every file under src/app/ as a route, and a `.test.tsx` file there gets bundled into the
// real web app too — its `expo-router/testing-library` import (which needs Jest's `expect` global) then
// crashes the actual dev server with "expect is not defined" on every page, not just this test suite.
import { Text } from 'react-native';
import { Slot } from 'expo-router';
import { renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { ThemeProvider } from '@/ui/theme';
import { NavigationThemeBridge } from './NavigationThemeBridge';
// Explicit .tsx extension: this directory also has `_layout.native.tsx`, and jest's default haste
// platform ("ios") would otherwise resolve the bare specifier to that native file instead of the web one
// actually implicated in the crash.
import TabLayout from '@/app/(tabs)/_layout.tsx';
import ChatLayout from '@/app/(tabs)/chat/_layout';

function RootLayout() {
  return (
    <ThemeProvider>
      <NavigationThemeBridge>
        <Slot />
      </NavigationThemeBridge>
    </ThemeProvider>
  );
}

function ChatIndexStub() {
  return <Text>CHAT_INDEX</Text>;
}
function ChatMessageStub() {
  return <Text>CHAT_MESSAGE</Text>;
}
function HqIndexStub() {
  return <Text>HQ_INDEX</Text>;
}
function FamilyIndexStub() {
  return <Text>FAMILY_INDEX</Text>;
}

// ThemeProvider defaults to role 'adult' (ROLES_CONFIG['adult'].tabs = chat/hq/family, src/test/tabs.test.ts),
// so TabLayout's TabList renders a trigger for all three — each needs a route to exist in this synthetic tree.
const ROUTES = {
  _layout: RootLayout,
  '(tabs)/_layout': TabLayout,
  '(tabs)/chat/_layout': ChatLayout,
  '(tabs)/chat/index': ChatIndexStub,
  '(tabs)/chat/[messageId]': ChatMessageStub,
  '(tabs)/hq/index': HqIndexStub,
  '(tabs)/family/index': FamilyIndexStub,
};

describe('(tabs) web layout + chat Stack', () => {
  test('renders /chat once without throwing ("Too many re-renders" regression)', async () => {
    await renderRouter(ROUTES, { initialUrl: '/chat' });
    expect(screen.getByText('CHAT_INDEX')).toBeTruthy();
  });

  test('switching tabs (Chat -> HQ -> Family) renders each without throwing', async () => {
    await renderRouter(ROUTES, { initialUrl: '/chat' });
    expect(screen.getByText('CHAT_INDEX')).toBeTruthy();

    await testRouter.push('/hq');
    expect(screen.getByText('HQ_INDEX')).toBeTruthy();

    await testRouter.push('/family');
    expect(screen.getByText('FAMILY_INDEX')).toBeTruthy();
  });
});
