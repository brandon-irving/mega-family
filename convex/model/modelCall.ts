// GD: the one way a feature action calls a model — spend guard reserve → call → record (or release on
// failure), priced for the role's model. The draft/judge, classifier and writer predate this and keep their
// own inline copies; every GD feature (homework, practice, clashes, gifts, bedtime prep) goes through here.
import { MODELS } from '../../shared/config/models';
import { chatCostCents, estimateChatCostCents, IMAGE_INPUT_TOKEN_ESTIMATE, PRICING, type TokenRates } from '../../shared/config/pricing';
import type { DecidedBy } from '../../shared/domain/tables';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';
import { getChatModel } from '../adapters/registry';
import type { ChatModelRequest, ChatModelResult, ModelRole } from '../ports/chatModel';

function ratesFor(role: ModelRole): TokenRates {
  return role === 'wording' ? PRICING.wording : PRICING.chat;
}

/** `model:<id>` for a role — what `decidedBy` / `wordedBy` / `reasonedBy` record (OpenDuet learning). */
export function decidedByModel(role: ModelRole): DecidedBy {
  return `model:${MODELS[role].model}`;
}

/** Calls the model for `familyId` inside the spend guard. Throws ChatModelError (model down) or a
 * BUDGET_EXCEEDED ConvexError (over the cap) — callers decide whether that fails the feature or falls back. */
export async function callModel(ctx: ActionCtx, familyId: Id<'families'>, req: ChatModelRequest): Promise<ChatModelResult> {
  const role = req.model ?? 'chat';
  const rates = ratesFor(role);
  const promptChars = req.messages.reduce((n, m) => n + m.content.length, 0);
  const imageCount = req.messages.reduce((n, m) => n + (m.images?.length ?? 0), 0);
  const estimatedCents = estimateChatCostCents(promptChars, req.maxTokens, rates, imageCount * IMAGE_INPUT_TOKEN_ESTIMATE);
  await ctx.runMutation(internal.spend.requireBudget, { familyId, estimatedCents });
  let result: ChatModelResult;
  try {
    result = await getChatModel().chat(req);
  } catch (e) {
    await ctx.runMutation(internal.spend.releaseReservation, { familyId, estimatedCents });
    throw e;
  }
  await ctx.runMutation(internal.spend.recordUsage, {
    familyId,
    tokensIn: result.usage.tokensIn,
    tokensOut: result.usage.tokensOut,
    images: imageCount || undefined,
    cents: chatCostCents(result.usage.tokensIn, result.usage.tokensOut, result.usage.cachedTokensIn ?? 0, rates),
    releaseCents: estimatedCents,
  });
  return result;
}

/** Parses a structured (`schema`) reply's JSON, or `null` when it's missing/not JSON. */
export function parseJson<T = Record<string, unknown>>(text: string | null): T | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}
