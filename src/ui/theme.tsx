// The design-system context: resolves THEMES + resolveAccent + resolveSizing (shared/config/theme.ts)
// into one object every primitive reads from. No component hardcodes a color, size or duration —
// they all come from here, so a config edit (new theme, new role sizing) changes every screen at once.
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { DEFAULT_THEME, DURATIONS, RADII, resolveAccent, resolveButtonSizing, resolveSizing, SPACING, THEMES, type ButtonSize, type ThemeTokens } from '@shared/config/theme';
import type { Role, ThemeName } from '@shared/domain/enums';
import { ROLES_CONFIG } from '@shared/config/roles';

export type Tokens = ThemeTokens & {
  spacing: typeof SPACING;
  radii: typeof RADII;
  durations: typeof DURATIONS;
  type: ReturnType<typeof resolveSizing>['type'];
  touchTarget: number;
  /** Extra tappable margin past `touchTarget` on every side (RN `hitSlop`) — G2 polish fix: the composer's
   * attach/mic buttons and the tab bar sit right at the 44pt floor; this pads the *hit area* without
   * changing layout. See shared/config/theme.ts HIT_SLOP. */
  hitSlop: number;
  bigTargets: boolean;
  accent: string;
  /** G3 review fix (HIGH, kid button sizes): notification/request/choice-block action-button sizing
   * from the design board (shared/config/theme.ts BUTTON_SIZES / resolveButtonSizing) — `Button`/
   * `ButtonRow` read this for those three card kinds instead of a per-call magic number. */
  buttonSize: ButtonSize;
};

type ThemeCtx = {
  themeName: ThemeName;
  setThemeName: (t: ThemeName) => void;
  role: Role;
  setRole: (r: Role) => void;
  tokens: Tokens;
};

const Ctx = createContext<ThemeCtx | null>(null);

/**
 * @param megaHex the viewer's own MEGA shell color, used when accent === 'mega' ("Match my MEGA").
 * @param accent 'theme' | 'mega' | { hex } — see shared/config/theme.ts resolveAccent.
 */
export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
  initialRole = 'adult',
  accent = 'mega',
  megaHex = THEMES[initialTheme].accent,
}: {
  children: ReactNode;
  initialTheme?: ThemeName;
  initialRole?: Role;
  accent?: 'theme' | 'mega' | { hex: string };
  megaHex?: string;
}) {
  // initialTheme/initialRole come from the viewer query, which resolves asynchronously and can
  // change after a settings save; themeName/role track it directly rather than mirroring it into
  // state (which would need an effect to stay in sync). A local override layers on top for the
  // Settings theme sheet's live preview, independent of the prop and cleared by passing `null`.
  const [themeOverride, setThemeOverride] = useState<ThemeName | null>(null);
  const [roleOverride, setRoleOverride] = useState<Role | null>(null);
  const themeName = themeOverride ?? initialTheme;
  const role = roleOverride ?? initialRole;

  const tokens = useMemo<Tokens>(() => {
    const base = THEMES[themeName];
    const sizing = resolveSizing(ROLES_CONFIG[role].bigTargets);
    return {
      ...base,
      accent: resolveAccent(themeName, accent, megaHex),
      spacing: SPACING,
      radii: RADII,
      durations: DURATIONS,
      type: sizing.type,
      touchTarget: sizing.touchTarget,
      hitSlop: sizing.hitSlop,
      bigTargets: ROLES_CONFIG[role].bigTargets,
      buttonSize: resolveButtonSizing(ROLES_CONFIG[role].bigTargets),
    };
  }, [themeName, role, accent, megaHex]);

  // G2 BLOCKER fix (white flash): app.config.ts bakes THEMES.midnight.bg into the native root view's
  // background (and the splash screen / Android adaptive icon) so the very first paint before any JS
  // runs is already dark — but that's a build-time default, fixed at the DEFAULT_THEME. Once the real
  // viewer's theme resolves (e.g. "Light"), the OS-level root view behind every screen needs updating too,
  // or a transition/sheet that momentarily shows raw native canvas (not yet covered by a Screen/contentStyle)
  // would flash the stale default instead of the current theme. Web has no such native root view (the
  // `+html.tsx` / Screen backgrounds already cover it) and expo-system-ui has no web implementation.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    SystemUI.setBackgroundColorAsync(tokens.bg).catch(() => {});
  }, [tokens.bg]);

  return <Ctx.Provider value={{ themeName, setThemeName: setThemeOverride, role, setRole: setRoleOverride, tokens }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

export function useTokens(): Tokens {
  return useTheme().tokens;
}
