// G4b: a US AQI or UV number → its level (config AQI_LEVELS / UV_LEVELS, labels in G4B_COPY) and the theme
// tokens it's drawn in (board WeatherAir: ok for the calm levels, warn for the middle, danger at the top). The
// level bands are config; which token a band uses is the app's choice (CONTRACT §7 note on AQI_LEVELS).
import { AQI_LEVELS, UV_LEVELS, levelOf as bandOf } from '@shared/config/integrations';
import { G4B_COPY } from '@shared/config/copy';
import type { Tokens } from '@/ui/theme';

export type AqiLevel = (typeof AQI_LEVELS)[number]['level'];
export type UvLevel = (typeof UV_LEVELS)[number]['level'];
export type LevelTone = 'ok' | 'warn' | 'danger';

const AQI_TONE: Record<AqiLevel, LevelTone> = { good: 'ok', moderate: 'warn', sensitive: 'warn', unhealthy: 'danger', veryUnhealthy: 'danger', hazardous: 'danger' };
const UV_TONE: Record<UvLevel, LevelTone> = { low: 'ok', moderate: 'warn', high: 'warn', veryHigh: 'danger', extreme: 'danger' };

export type LevelInfo = { value: number; word: string; tone: LevelTone };

export function aqiLevel(aqi: number): LevelInfo {
  const level = bandOf(AQI_LEVELS, aqi);
  return { value: Math.round(aqi), word: G4B_COPY.aqiLevels[level], tone: AQI_TONE[level] };
}

export function uvLevel(uv: number): LevelInfo {
  const level = bandOf(UV_LEVELS, uv);
  return { value: Math.round(uv), word: G4B_COPY.uvLevels[level], tone: UV_TONE[level] };
}

/** Foreground and tinted fill for a level (the board's colored tile border/word over a soft fill). */
export function toneColors(tokens: Tokens, tone: LevelTone): { fg: string; bg: string } {
  if (tone === 'danger') return { fg: tokens.danger, bg: tokens.dangerSurface };
  if (tone === 'warn') return { fg: tokens.warn, bg: tokens.warnSurface };
  return { fg: tokens.success, bg: tokens.bg };
}
