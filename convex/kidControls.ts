// CONTRACT §4 `kidControls.*`: parents set a kid's rules; v0.17b, a kid reads their own (read-only) and a parent
// sets the kid's buzzes-a-day.
import { LIMITS } from '../shared/config';
import { API } from '../shared/domain/api';
import type { Doc } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer, sameFamilyMember } from './model/viewer';

type Viewer = Awaited<ReturnType<typeof requireViewer>>;

/** The kid `memberId` names, when the caller is one of their parents (else FORBIDDEN). */
async function requireParentOfKid(ctx: MutationCtx, viewer: Viewer, memberId: Doc<'members'>['_id']): Promise<Doc<'members'>> {
  const target = await sameFamilyMember(ctx, viewer.member.familyId, memberId);
  if (target.role !== 'kid' || !viewer.isParentOf.includes(target._id)) fail('FORBIDDEN');
  return target;
}

export const set = mutation({
  ...pick(API.kidControls.set),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const target = await requireParentOfKid(ctx, viewer, args.memberId);
    const row = await ctx.db
      .query('kidControls')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', target._id))
      .unique();
    if (!row) fail('NOT_FOUND');
    const patch = Object.fromEntries(Object.entries(args.patch).filter(([, v]) => v !== undefined));
    await ctx.db.patch(row._id, patch);
    return null;
  },
});

/** v0.17b: the caller's own rules when they're a kid (Profile → Rules and limits, read-only); null for adults. */
export const mine = query({
  ...pick(API.kidControls.mine),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.member.role !== 'kid') return null;
    const row = await ctx.db
      .query('kidControls')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', viewer.member._id))
      .unique();
    if (!row) return null;
    return {
      homeworkMode: row.homeworkMode,
      quietHours: row.quietHours,
      ...(row.dailyMinutes !== undefined ? { dailyMinutes: row.dailyMinutes } : {}),
      blockedTopics: row.blockedTopics,
      tellsParents: row.tellsParents,
      parentsCanReadChat: row.parentsCanReadChat,
      webSearch: row.webSearch,
      dailyCap: viewer.settings.notify.dailyCap,
    };
  },
});

/** v0.17b: a parent sets a kid's buzzes-a-day (the kid's settings.notify.dailyCap; kids can't set notify). */
export const setDailyCap = mutation({
  ...pick(API.kidControls.setDailyCap),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const target = await requireParentOfKid(ctx, viewer, args.memberId);
    const { min, max } = LIMITS.push.kidDailyCapRange;
    if (!Number.isInteger(args.dailyCap) || args.dailyCap < min || args.dailyCap > max) fail('VALIDATION', `between ${min} and ${max}`);
    const settings = await ctx.db
      .query('settings')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', target._id))
      .unique();
    if (!settings) fail('NOT_FOUND');
    await ctx.db.patch(settings._id, { notify: { ...settings.notify, dailyCap: args.dailyCap } });
    return null;
  },
});
