import type { FrameName } from '../sprite';
import { CHARACTER_EDITOR } from './characterEditor';
/** Demo gallery registry. Entrance renders the production sequence; sprite studies use its frames. */
export const ANIMATION_PREVIEWS = [
  { id: 'entrance', label: 'First chat entrance', frames: [] as FrameName[], frameMs: 0, durationMs: 0 },
  { id: 'walk', label: 'Walking', frames: ['stepL', 'stepR'] as FrameName[], frameMs: CHARACTER_EDITOR.introduction.frameMs, durationMs: 4000 },
  { id: 'wave', label: 'Greeting wave', frames: ['waveIn', 'waveOut'] as FrameName[], frameMs: CHARACTER_EDITOR.introduction.waveFrameMs, durationMs: 3000 },
] as const;
export type AnimationPreviewId = typeof ANIMATION_PREVIEWS[number]['id'];

export const ANIMATION_PREVIEW_LAYOUT = { height: 380 };
