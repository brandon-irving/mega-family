// Spoken MEGA names (CONTRACT §4 "Spoken MEGA names", added v0.2). One module, used by both
// `talk.transcribe` and `chat.send(via: "voice")`, so a mention works the same typed or spoken.
//
// G1 scope: only the loose sound-alike match runs. CONTRACT describes a second pass ("Muse Spark only
// when the match is uncertain") for borderline cases; that needs a wired model adapter, which is out of
// scope while `talk.transcribe`/`chat.send` are day-1 stubs. Documented, not silently dropped.
import { LIMITS } from '../../shared/config';
import type { SpokenMention } from '../../shared/domain/messages';
import type { Id } from '../_generated/dataModel';

/** Levenshtein edit distance, normalized to a 0–1 similarity (1 = identical). */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = temp;
    }
  }
  const distance = dp[b.length];
  return 1 - distance / Math.max(a.length, b.length);
}

/** Finds MEGA names heard in `text`: tokenizes on word boundaries and compares each token against every
 * family MEGA's name (case-insensitive). Keeps the best match per token above `LIMITS.mention.minSimilarity`. */
export function detectSpokenMentions(text: string, megas: { megaId: Id<'megas'>; name: string }[]): SpokenMention[] {
  if (megas.length === 0) return [];
  const mentions: SpokenMention[] = [];
  const tokenRe = /[A-Za-z']+/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text))) {
    const token = m[0];
    const tokenLower = token.toLowerCase();
    let best: { megaId: Id<'megas'>; score: number } | null = null;
    for (const mega of megas) {
      const score = similarity(tokenLower, mega.name.toLowerCase());
      if (!best || score > best.score) best = { megaId: mega.megaId, score };
    }
    if (best && best.score >= LIMITS.mention.minSimilarity) {
      mentions.push({ megaId: best.megaId, heard: token, start: m.index, end: m.index + token.length, confidence: best.score });
    }
  }
  return mentions;
}
