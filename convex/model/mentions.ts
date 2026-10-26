// Spoken MEGA names (CONTRACT §4 "Spoken MEGA names", added v0.2). One module, used by both
// `talk.transcribe` and `chat.send(via: "voice")`, so a mention works the same typed or spoken.
//
// G2: the loose sound-alike match runs first and confidently-matched tokens never touch the model. Tokens
// in the "uncertain" band (convex/agent/mentionResolver.ts) get a second pass through Muse Spark — see
// that module for the escalation itself; this one stays model-free and synchronous.
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

export interface TokenCandidate {
  token: string;
  start: number;
  end: number;
  best: { megaId: Id<'megas'>; score: number } | null;
}

/** Tokenizes `text` on word boundaries and finds the best-matching family MEGA name for every token,
 * regardless of score — the shared first pass behind both `detectSpokenMentions` (confident matches only)
 * and the uncertain-band escalation in `convex/agent/mentionResolver.ts`. */
export function candidateTokens(text: string, megas: { megaId: Id<'megas'>; name: string }[]): TokenCandidate[] {
  if (megas.length === 0) return [];
  const out: TokenCandidate[] = [];
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
    out.push({ token, start: m.index, end: m.index + token.length, best });
  }
  return out;
}

/** Finds MEGA names heard in `text` with a confident (>= `LIMITS.mention.minSimilarity`) sound-alike match —
 * no model call. Tokens below that are either escalated (`mentionResolver.ts`) or dropped outright
 * (below `LIMITS.mention.escalateFloor`, too weak to bother the model with). */
export function detectSpokenMentions(text: string, megas: { megaId: Id<'megas'>; name: string }[]): SpokenMention[] {
  return candidateTokens(text, megas)
    .filter((c) => c.best && c.best.score >= LIMITS.mention.minSimilarity)
    .map((c) => ({ megaId: c.best!.megaId, heard: c.token, start: c.start, end: c.end, confidence: c.best!.score }));
}
