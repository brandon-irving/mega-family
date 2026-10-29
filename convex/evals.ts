// GD + G4 + G5 evals (evals/run.ts): the push judge, the kid search query check and the Gmail extraction, run on one synthetic case through the
// production prompt, parser and thresholds, inside the spend guard (callModel). Internal only; nothing in the app calls it.
import { v } from 'convex/values';
import { LIMITS } from '../shared/config/limits';
import type { Role } from '../shared/domain/enums';
import { internalAction } from './_generated/server';
import { callModel } from './model/modelCall';
import { DRAFT_JUDGE_SCHEMA, buildDraftJudgePrompt, judgedDelivery, parseDraftJudgeResult } from './model/proactive';
import { kidQueryVerdict } from './search';
import { KID_SAFETY } from '../shared/config/kidSafety';
import { extractItems, isSkippedSender } from './model/mailExtract';

/** The mail eval's fixed clock: Sunday Oct 25, 2026, 10 AM New York (the seed week), so dates resolve the same
 * every run. */
const EVAL_MAIL_TZ = 'America/New_York';
const EVAL_MAIL_NOW = Date.UTC(2026, 9, 25, 14);

/** G5 eval (evals/mailExtract): one synthetic email through the production sender skip + extraction call
 * (convex/model/mailExtract.ts). */
export const mailExtractCase = internalAction({
  args: { familyId: v.id('families'), fromName: v.string(), fromAddress: v.string(), subject: v.string(), text: v.string() },
  returns: v.object({ kinds: v.array(v.string()), titles: v.array(v.string()), decidedBy: v.string() }),
  handler: async (ctx, args) => {
    if (isSkippedSender(args.fromAddress)) return { kinds: ['skip'], titles: [], decidedBy: 'rule:skipSender' };
    const message = { id: 'eval', threadId: 'eval', internalDate: EVAL_MAIL_NOW, fromName: args.fromName, fromAddress: args.fromAddress, subject: args.subject, text: args.text };
    const r = await extractItems(ctx, args.familyId, message, EVAL_MAIL_TZ, EVAL_MAIL_NOW);
    return { kinds: r.items.map((i) => i.kind), titles: r.items.map((i) => `${i.title} ${i.date}${i.time ? ` ${i.time}` : ''}`), decidedBy: r.decidedBy };
  },
});

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

/** G4 eval (evals/kidSearch): the kid filter's query step (keyword backstop + model check) on one synthetic
 * query, exactly as a kid's `web_search` runs it. No web search is made. */
export const kidQueryCase = internalAction({
  args: { familyId: v.id('families'), query: v.string() },
  returns: v.object({ verdict: v.string(), decidedBy: v.string(), detail: v.string() }),
  handler: async (ctx, args) => {
    const r = await kidQueryVerdict(ctx, args.familyId, args.query, KID_SAFETY.search.defaultAgeBand);
    if (r.verdict === 'failed') return { verdict: 'failed', decidedBy: '', detail: 'model unreachable' };
    const detail = r.verdict === 'blocked' ? (r.category ?? '') : (r.rephrased ?? '') + (r.homeworkAnswer ? ' [homework]' : '');
    return { verdict: r.verdict, decidedBy: r.decidedBy, detail };
  },
});
