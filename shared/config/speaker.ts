// PLAN "Talk mode": "Spoken replies come later... a text-to-speech service gets added behind a
// Speaker port when ready" — gated by this one flag, default off, per the decided plan. Flipping it
// on is a config edit; src/services/speaker.ts is the only file that reads it.
export const SPEAKER_CONFIG = { enabled: false } as const;
