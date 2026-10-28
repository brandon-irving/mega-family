// Model pricing (PLAN.md → Cost; task brief → spend guard). Used by convex/model/spend.ts to estimate and
// record cents spent per family per day. A config edit here is the only thing needed if Meta's prices change.
export type TokenRates = { inputCentsPerMTok: number; cachedInputCentsPerMTok: number; outputCentsPerMTok: number };

export const PRICING = {
  /** Muse Spark 1.3 (shared/config/models.ts MODELS.chat/judge/vision), per CONTRACT and PLAN.md → Cost. */
  chat: {
    inputCentsPerMTok: 125, // $1.25 / M input tokens
    cachedInputCentsPerMTok: 15, // $0.15 / M cached input tokens
    outputCentsPerMTok: 425, // $4.25 / M output tokens
  },
  /** GD: Muse Wonder 1.0 (MODELS.wording), Meta pricing page Oct 28: $4.00 in / $0.20 cached / $20.00 out per M. */
  wording: {
    inputCentsPerMTok: 400,
    cachedInputCentsPerMTok: 20,
    outputCentsPerMTok: 2000,
  },
  /** Muse Voice Transcribe, task brief: $3 / 1000 minutes = $0.003/min = 0.3 cents/min. */
  transcribe: {
    centsPerMinute: 0.3,
  },
} as const;

/** GD: an image is billed as input tokens (Meta's image-understanding guide, Oct 28: a ~1280px image adds
 * roughly 1,300-1,500 tokens). Only for the pessimistic pre-call estimate; the real cost comes from `usage`. */
export const IMAGE_INPUT_TOKEN_ESTIMATE = 2000;

/** Cost in cents for one chat completion call. `cachedTokensIn` must be <= `tokensIn` (clamped defensively —
 * an adapter bug reporting more cached than total input tokens shouldn't be able to make this go negative).
 * `rates` defaults to Muse Spark's; pass `PRICING.wording` for a Muse Wonder call. */
export function chatCostCents(tokensIn: number, tokensOut: number, cachedTokensIn = 0, rates: TokenRates = PRICING.chat): number {
  const safeIn = Math.max(0, Number.isFinite(tokensIn) ? tokensIn : 0);
  const safeOut = Math.max(0, Number.isFinite(tokensOut) ? tokensOut : 0);
  const safeCached = Math.max(0, Math.min(Number.isFinite(cachedTokensIn) ? cachedTokensIn : 0, safeIn));
  const billableIn = safeIn - safeCached;
  return (billableIn * rates.inputCentsPerMTok + safeCached * rates.cachedInputCentsPerMTok + safeOut * rates.outputCentsPerMTok) / 1_000_000;
}

/** Cost in cents for one transcription call, given its audio duration in ms. */
export function transcribeCostCents(durationMs: number): number {
  const safeMs = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  return (safeMs / 60_000) * PRICING.transcribe.centsPerMinute;
}

/** A rough pre-call estimate (before the real response/usage is known), used only to refuse a call whose
 * worst case would blow the budget. Assumes ~4 characters per token for the prompt and the full `maxTokens`
 * ceiling for the output — deliberately pessimistic. */
export function estimateChatCostCents(promptChars: number, maxTokens: number, rates: TokenRates = PRICING.chat, extraTokensIn = 0): number {
  const estimatedTokensIn = Math.ceil(Math.max(0, promptChars) / 4) + Math.max(0, extraTokensIn);
  return chatCostCents(estimatedTokensIn, Math.max(0, maxTokens), 0, rates);
}
