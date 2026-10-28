// CONTRACT §4 `practice.*` (GD, v0.13). The kid answers; the kid or their parents read. The correct answer
// never leaves the server, for anyone (convex/model/practice.ts `practiceViewOf`).
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { answerQuestion, practiceViewOf, requirePracticeViewer, useHint } from './model/practice';
import { requireViewer } from './model/viewer';
import { clock } from './ports/clock';

export const get = query({
  ...pick(API.practice.get),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const set = await ctx.db.get(args.setId);
    if (!set) fail('NOT_FOUND');
    requirePracticeViewer(viewer, set);
    return practiceViewOf(ctx, set, viewer.member);
  },
});

export const answer = mutation({
  ...pick(API.practice.answer),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const set = await ctx.db.get(args.setId);
    if (!set || set.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const now = await clock.now(ctx, viewer.member.familyId);
    return answerQuestion(ctx, { set, kid: viewer.member, questionId: args.questionId, choiceIndex: args.choiceIndex, now });
  },
});

export const hint = mutation({
  ...pick(API.practice.hint),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const set = await ctx.db.get(args.setId);
    if (!set || set.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const now = await clock.now(ctx, viewer.member.familyId);
    return useHint(ctx, { set, kid: viewer.member, questionId: args.questionId, now });
  },
});
