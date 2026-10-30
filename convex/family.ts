// CONTRACT §4 "Family" (+ `family.parentCode` from "Session and onboarding", same module).
import { API } from '../shared/domain/api';
import { canReadKidThread } from '../shared/domain/family';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { addFamilyMember } from './model/familyAdd';
import { clock } from './ports/clock';
import { canSeeEvent } from './model/visibility';
import { upcomingEvents } from './model/home';
import { megaStatusFor } from './model/megaStatus';
import { requireAdmin, requireViewer, sameFamilyMember } from './model/viewer';

export const parentCode = query({
  ...pick(API.family.parentCode),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    requireAdmin(viewer.member.role);
    const family = await ctx.db.get(viewer.member.familyId);
    if (!family) fail('NOT_FOUND');
    return { code: family.parentCode };
  },
});

export const members = query({
  ...pick(API.family.members),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const rows = await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', viewer.member.familyId))
      .collect();
    const sharing = await ctx.db
      .query('sharing')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId))
      .collect();
    const sharingByMember = new Map(sharing.map((s) => [s.memberId, s]));
    const out = [];
    for (const member of rows) {
      const mega = await ctx.db
        .query('megas')
        .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId).eq('ownerId', member._id))
        .unique();
      const status = mega
        ? await megaStatusFor(ctx, viewer.member.familyId, viewer.member._id, member._id, mega, sharingByMember.get(member._id)?.hqActivity)
        : null;
      out.push({ member, mega: mega ?? null, status });
    }
    return out;
  },
});

export const member = query({
  ...pick(API.family.member),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const target = await sameFamilyMember(ctx, viewer.member.familyId, args.memberId);
    const mega = await ctx.db
      .query('megas')
      .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId).eq('ownerId', target._id))
      .unique();
    const relRows = await ctx.db
      .query('relationships')
      .withIndex('by_family_from', (q) => q.eq('familyId', viewer.member.familyId).eq('from', target._id))
      .collect();
    const relationshipToViewer = relRows.find((r) => r.to === viewer.member._id)?.kind ?? null;

    const isParent = viewer.isParentOf.includes(target._id);
    const kidControlsDoc =
      target.role === 'kid' && isParent
        ? await ctx.db
            .query('kidControls')
            .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', target._id))
            .unique()
        : null;
    const canReadChat = target._id === viewer.member._id || canReadKidThread(isParent, kidControlsDoc?.parentsCanReadChat);

    return { member: target, mega: mega ?? null, relationshipToViewer, kidControls: kidControlsDoc ?? null, canReadChat };
  },
});

export const kidThread = query({
  ...pick(API.family.kidThread),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const target = await sameFamilyMember(ctx, viewer.member.familyId, args.memberId);
    if (!viewer.isParentOf.includes(target._id)) fail('FORBIDDEN');
    const controls = await ctx.db
      .query('kidControls')
      .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', target._id))
      .unique();
    if (!controls?.parentsCanReadChat) fail('FORBIDDEN', "parentsCanReadChat is off for this kid");

    const thread = await ctx.db
      .query('threads')
      .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId).eq('ownerId', target._id))
      .unique();
    if (!thread) return { page: [], isDone: true, continueCursor: '' }; // no login (e.g. the toddler) => no thread
    return ctx.db
      .query('messages')
      .withIndex('by_family_thread_at', (q) => q.eq('familyId', viewer.member.familyId).eq('threadId', thread._id))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const comingUp = query({
  ...pick(API.family.comingUp),
  handler: async (ctx) => upcomingEvents(ctx, await requireViewer(ctx)),
});

// G5 (CONTRACT v0.17): the onboarding family step's "add a person" (later Family → Add a family member). Admin
// only. The member has no login until they redeem an invite; see convex/model/familyAdd.ts.
export const add = mutation({
  ...pick(API.family.add),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireAdmin(viewer.member.role);
    const now = await clock.now(ctx, viewer.member.familyId);
    const memberId = await addFamilyMember(ctx, viewer.member, args, now);
    return { memberId };
  },
});

export const nextEvent = query({
  ...pick(API.family.nextEvent),
  handler: async ctx => {
    const viewer = await requireViewer(ctx);
    const now = await clock.now(ctx, viewer.member.familyId);
    const events = ctx.db.query('events').withIndex('by_family_start', q => q.eq('familyId', viewer.member.familyId).gte('start', now));
    for await (const event of events) {
      if (!event.cancelled && canSeeEvent({ memberId: viewer.member._id, role: viewer.member.role }, event)) return event;
    }
    return null;
  },
});
