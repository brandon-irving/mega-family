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
// `render` comes from here, not 'expo-router/testing-library' — that package's own .d.ts re-exports
// `@testing-library/react-native` as `export type *`, so `render` type-checks as a type only there even
// though it IS a real value at runtime (tsc rejects using it, jest doesn't care).
import { render } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen, testRouter } from 'expo-router/testing-library';
import { APP_ERROR_COPY } from '@shared/config/copy';
import { ThemeProvider } from '@/ui/theme';
import { NavigationThemeBridge } from './NavigationThemeBridge';
// Explicit .tsx extension: this directory also has `_layout.native.tsx`, and jest's default haste
// platform ("ios") would otherwise resolve the bare specifier to that native file instead of the web one
// actually implicated in the crash.
// A namespace import (not just the default): expo-router/testing-library's in-memory context only keeps a
// route's named exports (its own `ErrorBoundary`, below) when given the whole module object — a bare
// function value is treated as `{ default: fn }`, dropping everything else.
import * as TabLayoutModule from '@/app/(tabs)/_layout.tsx';
import ChatLayout from '@/app/(tabs)/chat/_layout';

// This suite exercises navigation; the independently tested demo menu requires a live Convex provider.
jest.mock('@/features/settings/DemoQuickMenu', () => ({ DemoQuickMenu: () => null }));

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
  '(tabs)/_layout': TabLayoutModule,
  '(tabs)/chat/_layout': ChatLayout,
  '(tabs)/chat/index': ChatIndexStub,
  '(tabs)/chat/[messageId]': ChatMessageStub,
  '(tabs)/hq/index': HqIndexStub,
  '(tabs)/ideas/index': () => <Text>IDEAS_INDEX</Text>,
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

    await testRouter.push('/ideas');
    expect(screen.getByText('IDEAS_INDEX')).toBeTruthy();

    await testRouter.push('/hq');
    expect(screen.getByText('HQ_INDEX')).toBeTruthy();

    await testRouter.push('/family');
    expect(screen.getByText('FAMILY_INDEX')).toBeTruthy();
  });
});

// G6 walkthrough fix (P0): tapping your own Family tab member card used to throw an uncaught
// ConvexError FORBIDDEN mid-render, white-screening the whole app. `(tabs)/_layout.tsx` now exports
// `ErrorBoundary` (Expo Router's per-route convention — docs.expo.dev/router "Error boundaries"), so a
// screen that throws shows a friendly retry screen instead. This stub stands in for that crash: any tab
// screen throwing while rendering is the same class of bug.
function ThrowingFamilyIndexStub(): never {
  throw new Error('simulated crash (e.g. an uncaught ConvexError FORBIDDEN)');
}

describe('(tabs) ErrorBoundary (G6 walkthrough #1, P0)', () => {
  test('a tab screen that throws shows the retry screen instead of white-screening the app', async () => {
    await renderRouter({ ...ROUTES, '(tabs)/family/index': ThrowingFamilyIndexStub }, { initialUrl: '/family' });
    expect(screen.getByText(APP_ERROR_COPY.title)).toBeTruthy();
    expect(screen.queryByText('FAMILY_INDEX')).toBeNull();
  });

  // Isolated from the router (rendering the exported `ErrorBoundary` directly with a mock `retry`):
  // re-rendering the *same* throwing stub through the real router to prove retry's wiring hits React's
  // own dev-mode error-replay behavior (it quietly re-invokes a failed render once more before
  // committing, which can swallow a single-shot "throw once then recover" stub) and is pathologically
  // slow under jest-expo's dev error logging either way.
  test('"Try again" calls the boundary\'s retry', async () => {
    const retry = jest.fn();
    await render(
      <ThemeProvider>
        <TabLayoutModule.ErrorBoundary error={new Error('simulated crash')} retry={retry} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByText(APP_ERROR_COPY.retry));
    expect(retry).toHaveBeenCalled();
  });

  // G6 review fix: the boundary showed the raw `error.message` under `__DEV__`, which could leak internals
  // (a ConvexError's message, a stack-bearing string) onto the screen in a dev build. It must always show
  // the fixed copy; the real message still goes to console.error for the developer to see in the terminal.
  test('never renders the raw error message, even with __DEV__ true — the fixed copy shows instead', async () => {
    const devBefore = (global as { __DEV__?: boolean }).__DEV__;
    (global as { __DEV__?: boolean }).__DEV__ = true;
    const secretMessage = 'simulated crash: internal detail that must never reach the screen';
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await render(
        <ThemeProvider>
          <TabLayoutModule.ErrorBoundary error={new Error(secretMessage)} retry={jest.fn()} />
        </ThemeProvider>,
      );
      expect(screen.queryByText(secretMessage)).toBeNull();
      expect(screen.getByText(APP_ERROR_COPY.body)).toBeTruthy();
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('simulated crash'), expect.anything());
    } finally {
      consoleError.mockRestore();
      (global as { __DEV__?: boolean }).__DEV__ = devBefore;
    }
  });
});
