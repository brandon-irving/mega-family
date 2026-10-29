// CONTRACT §4 `kidControls.*`: parents set a kid's rules; v0.17b, a kid reads their own (read-only) and a parent
// sets the kid's buzzes-a-day.
import { LIMITS } from '../shared/config';
import { ONBOARDING } from '../shared/config/onboarding';
import { API } from '../shared/domain/api';
import type { Doc } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer, sameFamilyMember } from './model/viewer';

type Viewer = Awaited<ReturnType<typeof requireViewer>>;

/** A family's relationship rows are few (ONBOARDING.maxFamilyMembers people); this bounds the scan. */
const RELATIONSHIPS_SCAN = ONBOARDING.maxFamilyMembers * ONBOARDING.maxFamilyMembers;

/** The kid `memberId` names, when the caller is one of their parents (else FORBIDDEN). */
async function requireParentOfKid(ctx: QueryCtx, viewer: Viewer, memberId: Doc<'members'>['_id']): Promise<Doc<'members'>> {
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
      parents: await parentNamesOf(ctx, viewer.member.familyId, viewer.member._id),
    };
  },
});

/** The names of a kid's parents (relationships `from` parent `to` kid), for "Set by Admin and Partner". */
async function parentNamesOf(ctx: QueryCtx, familyId: Doc<'members'>['familyId'], kidId: Doc<'members'>['_id']): Promise<string[]> {
  const rows = await ctx.db
    .query('relationships')
    .withIndex('by_family_from', (q) => q.eq('familyId', familyId))
    .take(RELATIONSHIPS_SCAN);
  const parentIds = rows.filter((r) => r.kind === 'parent' && r.to === kidId).map((r) => r.from);
  const parents = await Promise.all(parentIds.map((id) => ctx.db.get(id)));
  return parents.flatMap((m) => (m ? [m.name] : []));
}

/** v0.17b reconcile: a parent reads the kid's current buzzes-a-day (the Rules stepper's value). */
export const dailyCap = query({
  ...pick(API.kidControls.dailyCap),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const target = await requireParentOfKid(ctx, viewer, args.memberId);
    const settings = await ctx.db
      .query('settings')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', target._id))
      .unique();
    if (!settings) fail('NOT_FOUND');
    return { dailyCap: settings.notify.dailyCap };
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
