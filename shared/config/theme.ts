// Theme presets. The app's design tokens build on these; the mockups shared the same values (themes.js).
import type { ThemeName } from '../domain/enums';
import type { WALLPAPER_PRESET_IDS } from './ids';

export type ThemeTokens = {
  label: string;
  accent: string;
  bg: string;
  surface: string;
  line: string;
  text: string;
  muted: string;
  /** Text/icon color on top of `accent` (a filled button, a selected chip, a badge count, …). */
  onAccent: string;
  /** A translucent full-bleed backdrop behind a modal/sheet. */
  scrim: string;
};

export const THEMES: Record<ThemeName, ThemeTokens> = {
  midnight: { label: 'Midnight', accent: '#2FB8B0', bg: '#0C0E11', surface: '#16191E', line: '#2E343D', text: '#EDEFF2', muted: '#9AA1AB', onAccent: '#FFFFFF', scrim: '#00000088' },
  light: { label: 'Light', accent: '#1E9A93', bg: '#F5F6F8', surface: '#FFFFFF', line: '#DDE1E6', text: '#14171C', muted: '#5F6670', onAccent: '#FFFFFF', scrim: '#00000088' },
};

export const DEFAULT_THEME: ThemeName = 'midnight';

/** The two text colors that read clearly against *any* background luminance — independent of
 * ThemeTokens because what they sit on isn't always the active theme's own accent (a MEGA's shell color
 * is user-customizable to any hex; `readableOn` below picks between these by WCAG contrast, the same
 * check regardless of which theme happens to be active). */
export const CONTRAST_TEXT = { light: '#FFFFFF', dark: '#14171C' } as const;

/** WCAG 2.x relative luminance of a `#rrggbb` hex color (0–1). https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.x contrast ratio between two `#rrggbb` hex colors — 1 (no contrast) to 21 (black on white).
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

/** G2 fix (contrast): the text/icon color that reads most clearly on an arbitrary accent hex — whichever
 * of `CONTRAST_TEXT.light`/`.dark` has the higher WCAG contrast ratio against it. `tokens.onAccent` alone
 * isn't enough for this because the *actual* background text sits on is often not the active theme's own
 * accent but a MEGA's custom shell color (any hex) — e.g. white-on-`#2FB8B0` (the "Midnight" theme's own
 * teal) is only 2.44:1, failing WCAG AA's 4.5:1 for body text, while dark text on the same teal is 7.36:1.
 * Single source of truth for this check — every place text sits on an accent (bubbles, primary buttons,
 * selected chips, badges) calls this instead of re-deriving its own contrast logic. */
export function readableOn(hex: string): string {
  return contrastRatio(hex, CONTRAST_TEXT.light) >= contrastRatio(hex, CONTRAST_TEXT.dark) ? CONTRAST_TEXT.light : CONTRAST_TEXT.dark;
}

/** Wallpaper presets drawn in code. */
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

// ---------- design tokens (G1 frontend) ----------
// Everything a component needs besides color lives here: spacing, radii, type scale, touch
// targets and animation timings. Primitives read these tokens only, never hardcoded values.
// `bigTargets` (from ROLES_CONFIG[role].bigTargets, config/roles.ts) selects the kid sizing set.

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const RADII = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export type TypeScaleKey = 'caption' | 'body' | 'label' | 'title' | 'headline' | 'display';
type TypeStyle = { fontSize: number; lineHeight: number; fontWeight: '400' | '500' | '600' | '700' };

/** Normal sizing (adult/admin); kid sizing (bigTargets) scales these up for bigger type and targets. */
export const TYPE_SCALE: Record<TypeScaleKey, TypeStyle> = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  headline: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
};

export const TYPE_SCALE_BIG: Record<TypeScaleKey, TypeStyle> = {
  caption: { fontSize: 14, lineHeight: 18, fontWeight: '500' },
  body: { fontSize: 19, lineHeight: 26, fontWeight: '500' },
  label: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  display: { fontSize: 36, lineHeight: 42, fontWeight: '700' },
};

/** Minimum touch target side, in points. Apple HIG / Material both land around 44–48. */
export const TOUCH_TARGET = { normal: 44, big: 56 } as const;

/** G2 polish fix: the 44pt floor (TOUCH_TARGET.normal) is the *visual* minimum — Apple HIG and Material
 * both also recommend padding the actual hit area a bit past a tightly-sized control (small icon buttons:
 * the composer's attach/mic, the tab bar's items) rather than growing the control itself. Added to every
 * side via RN's `hitSlop`, so the tappable region is `touchTarget + 2 * hitSlop` without changing layout. */
export const HIT_SLOP = { normal: 8, big: 12 } as const;

export const DURATIONS = { fast: 120, base: 200, slow: 400, greeting: 2000 } as const;

/** The sign-in wordmark (Screen 9 boards, owner Oct 27: "MEGA in large letters"). Its own token rather
 * than a TYPE_SCALE step: it appears once, on the welcome screen, and the walking MEGAs stand on the tops
 * of its capitals (`capTop` is where those tops sit below the line box's top, as a fraction of fontSize). */
export const WORDMARK = { fontSize: 80, lineHeight: 80, fontWeight: '900', letterSpacingEm: 0.06, capTop: 0.14 } as const;

/** Resolves the sizing a member sees: `bigTargets` comes from ROLES_CONFIG[role].bigTargets. */
export function resolveSizing(bigTargets: boolean) {
  return {
    type: bigTargets ? TYPE_SCALE_BIG : TYPE_SCALE,
    touchTarget: bigTargets ? TOUCH_TARGET.big : TOUCH_TARGET.normal,
    hitSlop: bigTargets ? HIT_SLOP.big : HIT_SLOP.normal,
  };
}

/** G3 review fix (HIGH, kid button sizes): notification/request/choice-block action-button sizing, from
 * the approved design board (`design/build/Push.template.html` ~line 197: `SIZES = { adult: { btnH: 44,
 * btnFont: 15 }, kid: { btnH: 54, btnFont: 18 } }`). Deliberately its own pair, not a reuse of
 * `TOUCH_TARGET`/`TYPE_SCALE` — those are the generic 44/56pt floor and type scale every other control
 * uses, and don't match the board's exact values here. Single source of truth: `Button`/`ButtonRow`
 * (src/ui) resolve a size from the viewer's role through this, never a per-call magic number, and the
 * same pair drives the board's 2-up pill layout (ButtonRow). */
export const BUTTON_SIZES = {
  adult: { height: 44, fontSize: 15 },
  kid: { height: 54, fontSize: 18 },
} as const;
export type ButtonSize = (typeof BUTTON_SIZES)[keyof typeof BUTTON_SIZES];

/** The sign-in screens' full-width pill buttons (Screen 9 boards: "Make my MEGA" 58/18, the rest 52/16). */
export const CTA_SIZES = {
  hero: { height: 58, fontSize: 18 },
  normal: { height: 52, fontSize: 16 },
} as const;

/** `bigTargets` comes from ROLES_CONFIG[role].bigTargets, same switch `resolveSizing` reads. */
export function resolveButtonSizing(bigTargets: boolean): ButtonSize {
  return bigTargets ? BUTTON_SIZES.kid : BUTTON_SIZES.adult;
}
