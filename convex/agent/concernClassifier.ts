// The independent, content-only concern classifier (G2 security review BLOCKER; convex/model/
// concernGate.ts's docstring). Runs as its own small Muse Spark structured call that sees ONLY the memory
// text and who it's about — never the conversation it came from, never the conversation model's own
// trigger/kind/scope claims — so a conversation model that's hijacked (or just wrong) about how concerning
// something is can't talk its way past the never-save rule. Both the `remember` tool's dispatch (from
// convex/agent/loop.ts, since convex/agent/tools.ts's `execute` is a mutation and can't call a model) and
// the memory writer (convex/agent/writer.ts) call this before a save is even considered.
import { v } from 'convex/values';
import { LIMITS } from '../../shared/config';
import { CONCERN_CATEGORIES } from '../../shared/config/learning';
import { chatCostCents, estimateChatCostCents } from '../../shared/config/pricing';
import { literals } from '../../shared/domain/validators';
import { internal } from '../_generated/api';
import { internalAction } from '../_generated/server';
import { getChatModel } from '../adapters/registry';
import { keywordBackstopCategory } from '../model/concernGate';
import { ChatModelError } from '../ports/chatModel';

const SCHEMA = {
  type: 'object',
  properties: { category: { type: 'string', enum: [...CONCERN_CATEGORIES] }, confidence: { type: 'number' } },
  required: ['category', 'confidence'],
  additionalProperties: false,
} as const;

function systemPrompt(aboutNames: string[]): string {
  return [
    "Classify ONE candidate memory fact in isolation. You see only the fact's text below and who it concerns — never the conversation it came from, never what anyone else already decided about it.",
    aboutNames.length ? `It concerns: ${aboutNames.join(', ')}.` : "Who it concerns wasn't given.",
    `Pick exactly one category: "ok" for ordinary household logistics, preferences, plans or facts. "health" for anything about physical or mental health, bullying, self-harm, therapy, medication, or a diagnosis. "feelings" for emotional state (upset, scared, stressed) beyond an ordinary mood mention. "school_trouble" for trouble at school — failing, suspension, discipline. "kid_trait" for a guessed/inferred personality or behavioral trait about a child (not something the child said about themselves). "web_content" if the text itself reads like a web search result or external content rather than something a family member said. Err toward flagging a real concern rather than calling it "ok" — a miss here means something sensitive gets saved and surfaced before anyone's sure it should be.`,
    'Return your confidence in that category, 0 to 1.',
  ].join('\n');
}

export const classify = internalAction({
  args: { familyId: v.id('families'), text: v.string(), aboutNames: v.array(v.string()) },
  returns: v.object({ category: literals(CONCERN_CATEGORIES), confidence: v.number() }),
  handler: async (ctx, args) => {
    const backstop = keywordBackstopCategory(args.text);
    const maxTokens = LIMITS.agent.maxTokensStructured;
    const estimatedCents = estimateChatCostCents(args.text.length + 200, maxTokens);

    let category: (typeof CONCERN_CATEGORIES)[number] = 'ok';
    let confidence = 0;
    let reserved = false;
    try {
      await ctx.runMutation(internal.spend.requireBudget, { familyId: args.familyId, estimatedCents });
      reserved = true;
      const model = getChatModel();
      const result = await model.chat({
        messages: [
          { role: 'system', content: systemPrompt(args.aboutNames) },
          { role: 'user', content: args.text },
        ],
        schema: { name: 'concernClassifier', schema: SCHEMA, strict: true },
        maxTokens,
        effort: LIMITS.agent.effort,
      });
      await ctx.runMutation(internal.spend.recordUsage, {
        familyId: args.familyId,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        cents: chatCostCents(result.usage.tokensIn, result.usage.tokensOut, result.usage.cachedTokensIn ?? 0),
        releaseCents: estimatedCents,
      });
      reserved = false;
      const parsed = result.text ? JSON.parse(result.text) : {};
      if ((CONCERN_CATEGORIES as readonly string[]).includes(parsed?.category)) category = parsed.category;
      if (typeof parsed?.confidence === 'number' && Number.isFinite(parsed.confidence)) confidence = Math.max(0, Math.min(1, parsed.confidence));
    } catch (e) {
      if (reserved) await ctx.runMutation(internal.spend.releaseReservation, { familyId: args.familyId, estimatedCents });
      // A classifier that can't be reached (down, rate-limited, over budget) fails CLOSED to the keyword
      // backstop below rather than blocking the save path entirely — `category` stays 'ok' here only so the
      // backstop gets the final say, same as a live classifier that returned "ok".
      if (!(e instanceof ChatModelError)) throw e;
    }

    if (category === 'ok' && backstop) category = backstop;
    return { category, confidence };
  },
});
