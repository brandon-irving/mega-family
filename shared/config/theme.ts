// Theme presets. The app's design tokens build on these; the mockups shared the same values (themes.js).
import type { ThemeName } from '../domain/enums';

export type ThemeTokens = { label: string; accent: string; bg: string; surface: string; line: string; text: string; muted: string };

export const THEMES: Record<ThemeName, ThemeTokens> = {
  midnight: { label: 'Midnight', accent: '#2FB8B0', bg: '#0C0E11', surface: '#16191E', line: '#2E343D', text: '#EDEFF2', muted: '#9AA1AB' },
  light: { label: 'Light', accent: '#1E9A93', bg: '#F5F6F8', surface: '#FFFFFF', line: '#DDE1E6', text: '#14171C', muted: '#5F6670' },
};

export const DEFAULT_THEME: ThemeName = 'midnight';

/** Wallpaper presets drawn in code. */
import type { WALLPAPER_PRESET_IDS } from './ids';

export const WALLPAPER_PRESETS: readonly { id: (typeof WALLPAPER_PRESET_IDS)[number]; label: string }[] = [
  { id: 'glow', label: 'MEGA glow' },
  { id: 'night', label: 'Night' },
  { id: 'dawn', label: 'Dawn' },
  { id: 'room', label: 'My room' },
];

/** The accent a member sees: the theme's own, their MEGA's color, or a custom hex. */
export function resolveAccent(theme: ThemeName, accent: 'theme' | 'mega' | { hex: string }, megaHex: string): string {
  if (accent === 'theme') return THEMES[theme].accent;
  if (accent === 'mega') return megaHex;
  return accent.hex;
}
