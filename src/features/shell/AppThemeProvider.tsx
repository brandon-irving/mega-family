// Bridges the viewer query (me.get) into the design-system ThemeProvider: the member's theme,
// accent and role drive every screen's tokens. Falls back to sensible defaults while the query is
// loading or before the backend lands, so the app is always renderable.
import type { ReactNode } from 'react';
import { DEFAULT_THEME } from '@shared/config/theme';
import { useViewer } from '@/data/useViewer';
import { ThemeProvider } from '@/ui/theme';

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  const themeName = viewer?.theme.name ?? DEFAULT_THEME;
  const role = viewer?.member.role ?? 'adult';
  const accent = viewer?.settings.accent ?? 'theme';
  const megaHex = viewer?.mega?.look.hex ?? viewer?.theme.accent ?? '#2FB8B0';

  return (
    <ThemeProvider initialTheme={themeName} initialRole={role} accent={accent} megaHex={megaHex}>
      {children}
    </ThemeProvider>
  );
}
