// Every component reads design tokens from ThemeProvider (src/ui/theme.tsx); tests render through
// this wrapper instead of each reaching for its own provider boilerplate.
import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/ui/theme';
import type { Role } from '@shared/domain/enums';

export function renderWithTheme(ui: ReactElement, opts: { role?: Role } = {}) {
  // @testing-library/react-native 13+: render() is async (it awaits the initial act() flush).
  return render(<ThemeProvider initialRole={opts.role ?? 'adult'}>{ui}</ThemeProvider>);
}
