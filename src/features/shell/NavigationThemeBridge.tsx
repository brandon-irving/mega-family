// G2 BLOCKER fix (white flash): React Navigation (which every Stack/NativeTabs in this app sits on,
// Expo Router included) paints its own screen/tab-container background from *its own* theme context
// (DarkTheme/DefaultTheme) before a screen's own content — our design tokens — ever mounts. Left
// unset, that defaults to DefaultTheme (white), which is exactly what a sign-in/cold-load/tab-switch
// transition would flash for an instant on native, independent of every Screen/contentStyle fix.
//
// docs.expo.dev/router/advanced/native-tabs calls this out directly: wrapping NativeTabs in this
// ThemeProvider "prevents white background flashes when switching tabs" — the same underlying cause as
// the G2 cold-load/sign-in flash, just surfacing on tab switches too. One bridge at the app root (inside
// AppThemeProvider, so `useTokens()` here is already the signed-in viewer's real theme) covers every
// nested Stack/NativeTabs — a React Navigation ThemeProvider's value is ordinary context, read by any
// navigator at any depth below it, not just an immediate child.
import { useMemo, type ReactNode } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { useTokens } from '@/ui/theme';

export function NavigationThemeBridge({ children }: { children: ReactNode }) {
  const tokens = useTokens();
  // Memoized for the same reason useThemedStackOptions (stackOptions.ts) is: React Navigation's
  // ThemeProvider/navigators react to this value's *identity*, not just its contents — a fresh object
  // every render triggers their own re-render, which (without memoization) built a fresh object again,
  // an infinite "Too many re-renders" loop caught after a real sign-in redirect on web.
  const theme = useMemo(() => {
    // The app's own theme setting is the source of truth here, not the OS color scheme
    // (`useColorScheme`) — THEMES.light reads as a "light" React Navigation theme regardless of the
    // device's own appearance.
    const isDark = relativeIsDark(tokens.bg);
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: isDark,
      colors: { ...base.colors, background: tokens.bg, card: tokens.surface, border: tokens.line, text: tokens.text, primary: tokens.accent },
    };
  }, [tokens.bg, tokens.surface, tokens.line, tokens.text, tokens.accent]);
  return <NavigationThemeProvider value={theme}>{children}</NavigationThemeProvider>;
}

/** Cheap luminance check (shared/config/theme.ts' WCAG helpers are for text-on-accent contrast, a
 * different question) — just "is this background dark or light" for React Navigation's own `dark` flag. */
function relativeIsDark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}
