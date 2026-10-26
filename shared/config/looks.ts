// MEGA look presets (from the sprite engine's looks.json) and personalities.
import type { Personality } from '../domain/enums';

/** Six preset shell colors; any hex is also allowed (custom picker). */
export const COLORS = {
  teal: '#2FB8B0',
  coral: '#F2766B',
  violet: '#8E6CE0',
  sun: '#F2B33D',
  sky: '#5B8DEF',
  leaf: '#5BBF6A',
} as const;

/** Preset stickers on the head; 'none' means no sticker. Art is drawn by Muse Image later. */
export { STICKERS } from './ids';
export type StickerId = (typeof import('./ids').STICKERS)[number];

export const FACES = ['calm', 'happy', 'wink', 'open', 'closed'] as const;
export type Face = (typeof FACES)[number];

/** Each personality sets the resting face and the speech pattern (prompt config lives with the agent). */
export const PERSONALITIES: Record<Personality, { label: string; face: Face; blurb: string; sample: string }> = {
  calm: { label: 'Calm', face: 'calm', blurb: 'Gentle and unhurried', sample: "No rush. Practice is at 5:30, and I'll remind you at 4:50." },
  cheerful: { label: 'Cheerful', face: 'happy', blurb: 'Upbeat and encouraging', sample: 'Good news! Practice is at 5:30. Want a reminder at 4:50?' },
  funny: { label: 'Funny', face: 'wink', blurb: 'Light jokes, still useful', sample: "Practice at 5:30. I'll ping you at 4:50, before traffic does." },
  brief: { label: 'Brief', face: 'open', blurb: 'Short and to the point', sample: 'Practice 5:30. Reminder at 4:50?' },
};

export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
