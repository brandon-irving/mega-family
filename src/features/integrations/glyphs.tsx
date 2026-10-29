// The Screen 14 boards' small line icons and the weather card's 8×8 pixel icons, drawn in code with
// react-native-svg (no icon font, no image). Decorative: hidden from screen readers on a wrapping View, never
// on the Svg itself (web would forward the native-only props to the DOM; see src/ui/a11y.ts).
import { View } from 'react-native';
import { Path, Rect, Svg } from 'react-native-svg';
import { WEATHER_CARD, WEATHER_ICONS, type WeatherIconKey, type WeatherPixel } from '@shared/config/weatherIcons';
import type { PLACE_KINDS } from '@shared/config/ids';
import { hiddenFromA11y } from '@/ui/a11y';
import { useTokens } from '@/ui/theme';

/** SVG path data on a 24×24 grid (the boards' icons, stroke-only). */
export const GLYPHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  car: 'M5 17h14 M6 17l1.5-6h9L18 17 M8 11l1-3h6l1 3 M8 19a1.5 1.5 0 1 0 0-.01 M16 19a1.5 1.5 0 1 0 0-.01',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  alert: 'M12 3l10 18H2z M12 10v5M12 18h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8h.01 M11 12h1v5h1',
  home: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6',
  school: 'M3 9l9-5 9 5-9 5z M7 11v5c3 2 7 2 10 0v-5',
  work: 'M4 8h16v12H4z M9 8V5h6v3',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  // G4b (Screen 15 boards).
  gift: 'M4 11h16v9H4z M3 7h18v4H3z M12 7v13 M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 7.5h.01',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5 M9 20h.01M18 20h.01',
  sun: 'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4 M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  air: 'M3 9h11a3 3 0 1 0-3-3 M3 14h15a3 3 0 1 1-3 3 M3 19h6',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
} as const;
export type GlyphName = keyof typeof GLYPHS;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_GLYPH: Record<PlaceKind, GlyphName> = { home: 'home', school: 'school', work: 'work', other: 'pin' };

export function Glyph({ name, color, size = 16, stroke = 2 }: { name: GlyphName; color: string; size?: number; stroke?: number }) {
  return (
    <View style={{ width: size, height: size }} {...hiddenFromA11y()}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={GLYPHS[name]} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/** One weather icon, 8×8 cells of `WEATHER_CARD.cell` points; colors come from theme token roles. */
export function WeatherIcon({ icon, label }: { icon: WeatherIconKey; label: string }) {
  const tokens = useTokens();
  const color: Record<WeatherPixel, string> = { S: tokens.bucks, C: tokens.muted, R: tokens.household, W: tokens.text };
  const cell = WEATHER_CARD.cell;
  const rows = WEATHER_ICONS[icon];
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: 8 * cell, height: 8 * cell }}>
      <View {...hiddenFromA11y()}>
        <Svg width={8 * cell} height={8 * cell} viewBox="0 0 8 8">
          {rows.flatMap((row, y) =>
            [...row].map((ch, x) => (ch === '.' ? null : <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color[ch as WeatherPixel]} />)),
          )}
        </Svg>
      </View>
    </View>
  );
}
