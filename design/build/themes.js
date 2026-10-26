// Theme tokens, mirrored from config/theme.ts in the app. Midnight is the default theme.
// The accent is either the theme's own or "match my MEGA" (the default for everyone but the admin).
const THEMES = {
  midnight: { label: 'Midnight', accent: '#2FB8B0', bg: '#0C0E11', surface: '#16191E', line: '#2E343D', text: '#EDEFF2', muted: '#9AA1AB' },
  light: { label: 'Light', accent: '#1E9A93', bg: '#F5F6F8', surface: '#FFFFFF', line: '#DDE1E6', text: '#14171C', muted: '#5F6670' },
};
const themeAccent = (theme, accent, megaHex) => (accent === 'mega' ? megaHex : accent === 'theme' ? THEMES[theme].accent : accent);
