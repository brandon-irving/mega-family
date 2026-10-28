// G4 Screen 14 (boards Weather / WeatherAlert): the weather card's 8×8 pixel icons, drawn in code (no icon font,
// no image). Open-Meteo reports WMO weather codes (open-meteo.com/en/docs → "WMO Weather interpretation codes");
// each code maps to one icon group. Pixel letters name a theme token role (the app resolves them to colors), so
// no color is hardcoded here: S sun/bolt (bucks yellow), C cloud (muted), R rain (household blue), W snow (text).

export type WeatherIconKey = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm';
export type WeatherPixel = 'S' | 'C' | 'R' | 'W';

export const WEATHER_ICONS: Record<WeatherIconKey, readonly string[]> = {
  sun: ['...S....', '.S.S.S..', '..SSS...', 'SSSSSSS.', '..SSS...', '.S.S.S..', '...S....', '........'],
  cloud: ['........', '...CC...', '..CCCC..', '.CCCCCC.', 'CCCCCCCC', 'CCCCCCCC', '........', '........'],
  rain: ['...CC...', '..CCCC..', '.CCCCCC.', 'CCCCCCCC', '........', '.R..R..R', 'R..R..R.', '........'],
  snow: ['...CC...', '..CCCC..', '.CCCCCC.', 'CCCCCCCC', '........', '.W..W..W', '..W..W..', '........'],
  storm: ['...CC...', '..CCCC..', '.CCCCCC.', 'CCCCCCCC', '...S....', '..SS....', '...S....', '..S.....'],
};

/** WMO code → icon and a short spoken label (the icon's accessibility label). Unknown codes read as cloud. */
export function weatherIconFor(code: number): { icon: WeatherIconKey; label: string } {
  if (code === 0 || code === 1) return { icon: 'sun', label: 'Sunny' };
  if (code === 2 || code === 3 || code === 45 || code === 48) return { icon: 'cloud', label: 'Cloudy' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: 'rain', label: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: 'snow', label: 'Snow' };
  if (code >= 95 && code <= 99) return { icon: 'storm', label: 'Thunderstorm' };
  return { icon: 'cloud', label: 'Cloudy' };
}

/** The weather card's hour strip (board: 5 columns). Rain chances at or above `rainHighlightPct` are drawn in
 * the rain color, lower ones muted. `cell` is one pixel's side in points (8 cells → a 24pt icon). */
export const WEATHER_CARD = { hours: 5, rainHighlightPct: 50, cell: 3 } as const;
