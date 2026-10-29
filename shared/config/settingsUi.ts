// G5 Settings (canvas Screen 7 boards Settings / SettingsTheme / SettingsWallpaper): the app-side knobs for the
// controls on those pages. The values they set (`settings.set`: theme, accent, wallpaper, notify) are the
// contract's; this only bounds the steppers and draws the wallpaper preset swatches.
import type { WALLPAPER_PRESET_IDS } from './ids';

export const SETTINGS_UI = {
  /** "Daily limit" stepper for an adult's own notifications (LIMITS.notifications.dailyCapAdult is the default). */
  dailyCap: { min: 1, max: 20 },
  /** Quiet hours move in steps of this many minutes. */
  quietStepMinutes: 30,
  /** A kid's daily time limit (Rules and limits), in minutes; 0 means no limit. */
  kidMinutes: { min: 0, max: 240, step: 15 },
} as const;

/** Each wallpaper preset's swatch: a top and bottom color (the boards' gradients, as two stops). `mega` uses the
 * MEGA's own color for the top stop. */
export const WALLPAPER_SWATCHES: Record<(typeof WALLPAPER_PRESET_IDS)[number], { top: string | 'mega'; bottom: string }> = {
  glow: { top: 'mega', bottom: '#0C0E11' },
  night: { top: '#2A3350', bottom: '#0C0E11' },
  dawn: { top: '#3B2A4F', bottom: '#B5655A' },
  room: { top: '#1B1F25', bottom: '#1B1F25' },
};
