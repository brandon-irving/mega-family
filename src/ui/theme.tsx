// The design-system context: resolves THEMES + resolveAccent + resolveSizing (shared/config/theme.ts)
// into one object every primitive reads from. No component hardcodes a color, size or duration —
// they all come from here, so a config edit (new theme, new role sizing) changes every screen at once.
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { DEFAULT_THEME, DURATIONS, RADII, resolveAccent, resolveSizing, SPACING, THEMES, type ThemeTokens } from '@shared/config/theme';
import type { Role, ThemeName } from '@shared/domain/enums';
import { ROLES_CONFIG } from '@shared/config/roles';

export type Tokens = ThemeTokens & {
  spacing: typeof SPACING;
  radii: typeof RADII;
  durations: typeof DURATIONS;
  type: ReturnType<typeof resolveSizing>['type'];
  touchTarget: number;
  bigTargets: boolean;
  accent: string;
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
      bigTargets: ROLES_CONFIG[role].bigTargets,
    };
  }, [themeName, role, accent, megaHex]);

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
