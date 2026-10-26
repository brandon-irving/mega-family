// The chirp + haptic tap at the start/end of each talk-mode turn (PLAN "Talk mode", decided Oct 24).
// Two tiny generated tones (assets/sounds/chirp-{start,end}.wav) behind expo-audio's player, plus
// expo-haptics — the only file that imports either, so talk.tsx just calls `turnStart()`/`turnEnd()`.
import { createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// Lazily created: constructing a player touches native audio session state, which jest/jsdom (and a
// plain `import` in a unit test file) shouldn't pay for.
let startPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let endPlayer: ReturnType<typeof createAudioPlayer> | null = null;

function play(getPlayer: () => ReturnType<typeof createAudioPlayer>) {
  try {
    const player = getPlayer();
    player.seekTo(0);
    player.play();
  } catch {
    // best-effort: a missing audio session (e.g. simulator with no output) shouldn't break talk mode
  }
}

export function turnStart(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  play(() => (startPlayer ??= createAudioPlayer(require('../../assets/sounds/chirp-start.wav'))));
}

export function turnEnd(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  play(() => (endPlayer ??= createAudioPlayer(require('../../assets/sounds/chirp-end.wav'))));
}
