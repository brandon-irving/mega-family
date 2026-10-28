// GD evals (evals/run.ts): the push judge, run on one synthetic case through the production prompt, parser
// and thresholds, inside the spend guard (callModel). Internal only; nothing in the app calls it.
import { v } from 'convex/values';
import { LIMITS } from '../shared/config/limits';
import type { Role } from '../shared/domain/enums';
import { internalAction } from './_generated/server';
import { callModel } from './model/modelCall';
import { DRAFT_JUDGE_SCHEMA, buildDraftJudgePrompt, judgedDelivery, parseDraftJudgeResult } from './model/proactive';

export const judgeCase = internalAction({
  args: {
    familyId: v.id('families'),
    source: v.union(v.literal('reminder'), v.literal('mattersTo'), v.literal('checkin')),
    role: v.union(v.literal('admin'), v.literal('adult'), v.literal('kid')),
    name: v.string(),
    text: v.string(),
  },
  returns: v.object({ delivery: v.string(), kind: v.string(), score: v.number() }),
  handler: async (ctx, args) => {
    const p = buildDraftJudgePrompt({
      familyId: args.familyId,
      recipientName: args.name,
      recipientRole: args.role,
      megaName: 'Teal',
      megaPersonalityBlurb: 'calm and helpful',
      source: { kind: args.source } as never, // only `.kind` is read by the prompt builder
      seedText: args.text,
      sentTodayCount: 1,
      reactionSummary: 'none yet',
    });
    const res = await callModel(ctx, args.familyId, {
      messages: [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      schema: { name: 'proactiveDraftJudge', schema: DRAFT_JUDGE_SCHEMA as unknown as Record<string, unknown>, strict: true },
      maxTokens: LIMITS.agent.maxTokensStructured,
      effort: LIMITS.agent.effort,
    });
    const parsed = parseDraftJudgeResult(res.text, p.fallbackKind, p.allowedKinds, args.text);
    return { delivery: judgedDelivery(parsed.kind, parsed.score, args.role as Role), kind: parsed.kind, score: parsed.score };
  },
});
