// G2 BLOCKER fix (white flash): every Stack in the app needs the same `contentStyle` — the current
// theme's bg — so a screen transition never shows an unstyled (default white) canvas for a frame, the
// same no-literal-canvas rule NavigationThemeBridge applies at the tab/stack-container level and
// src/ui/Screen.tsx applies per screen. One hook, not one re-derivation per Stack file (DRY).
//
// Regression (caught after a real sign-in redirect on web): this *must* memoize — React Navigation's
// `<Stack screenOptions={...}>` calls `navigation.setOptions` when the `screenOptions` object it's given
// changes identity, which re-renders this component, which (without memoization) built a brand-new
// object every render, which changed identity again — "Too many re-renders". useMemo keyed on the one
// value that actually changes (tokens.bg) keeps the same reference across re-renders where it didn't.
import { useMemo } from 'react';
import { useTokens } from '@/ui/theme';

export function useThemedStackOptions() {
  const tokens = useTokens();
  return useMemo(() => ({ headerShown: false, contentStyle: { backgroundColor: tokens.bg } }) as const, [tokens.bg]);
}
