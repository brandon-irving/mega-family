// CONTRACT §4 "MEGA profile, memory and learnings": `megas.status` / `.mine` / `.update` / `.activity`.
import { v } from 'convex/values';
import { ACTIVITY } from '../shared/config/activity';
import { API } from '../shared/domain/api';
import { internalQuery, mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { megaStatusFor } from './model/megaStatus';
import { assertKidMayWear, keepStartingItems, wornItemIds } from './model/store';
import { clock } from './ports/clock';
import { requireAdmin, requireViewer } from './model/viewer';

/** The caller's family MEGAs, by name — used by `talk.transcribe`'s spoken-mention matcher. Lives here
 * (not in convex/talk.ts) so `internal.megas.forMentionMatching` isn't a same-module self-reference, which
 * confuses TS's inference for the calling action (see convex/talk.ts). */
export const forMentionMatching = internalQuery({
  args: {},
  returns: v.array(v.object({ megaId: v.id('megas'), name: v.string() })),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const megas = await ctx.db
      .query('megas')
      .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId))
      .collect();
    return megas.map((m) => ({ megaId: m._id, name: m.name }));
  },
});

export const status = query({
  ...pick(API.megas.status),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const mega = await ctx.db.get(args.megaId);
    if (!mega || mega.familyId !== viewer.member.familyId) fail('NOT_FOUND');
    const sharing = mega.ownerId
      ? await ctx.db
          .query('sharing')
          .withIndex('by_family_member', (q) => q.eq('familyId', viewer.member.familyId).eq('memberId', mega.ownerId!))
          .unique()
      : null;
    return megaStatusFor(ctx, viewer.member.familyId, viewer.member._id, mega.ownerId, mega, sharing?.hqActivity);
  },
});

export const mine = query({
  ...pick(API.megas.mine),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (!viewer.mega) fail('NOT_FOUND');
    return viewer.mega;
  },
});

/** GD backend addendum: the family MEGA's badge (Hub), for any member. */
export const family = query({
  ...pick(API.megas.family),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const megas = await ctx.db
      .query('megas')
      .withIndex('by_family_owner', (q) => q.eq('familyId', viewer.member.familyId))
      .collect();
    const hub = megas.find((x) => x.kind === 'family');
    if (!hub) fail('NOT_FOUND');
    return { megaId: hub._id, name: hub.name, hex: hub.look.hex, sticker: hub.look.sticker };
  },
});

export const update = mutation({
  ...pick(API.megas.update),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (!viewer.mega) fail('NOT_FOUND');
    if (args.name !== undefined && viewer.member.role === 'kid') fail('FORBIDDEN', "kids can't rename their MEGA");
    // GD (invariant 6): a kid wears only look parts they own (free, bought, or already worn); adults are free.
    if (args.look && viewer.member.role === 'kid') {
      await assertKidMayWear(ctx, viewer.member, viewer.mega, args.look);
      await keepStartingItems(ctx, viewer.member, wornItemIds(viewer.mega.look), await clock.now(ctx, viewer.member.familyId));
    }
    const patch = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
    await ctx.db.patch(viewer.mega._id, patch);
    return null;
  },
});

function summarize(event: { type: string; payload: unknown }): string {
  switch (event.type) {
    case 'said':
      return 'Someone said something MEGA noticed.';
    case 'calendar.changed':
      return 'The calendar changed.';
    case 'list.changed':
      return 'A list changed.';
    case 'reminder.due':
      return 'A reminder came due.';
    case 'weather.alert':
      return 'A weather alert came in.';
    case 'notification.answered':
      return 'A notification was answered.';
    case 'clock.tick':
      return 'The clock ticked.';
    case 'job.changed':
      return "A MEGA's job changed.";
    default:
      return event.type;
  }
}

/** v0.17b: who decided — the event's own `payload.decidedBy` (a string), else ACTIVITY.decidedByDefault[type]. */
/// A person's event names them as `member:<id>` only when its payload's `actorId` is a member of this family;
/// otherwise it stays a bare `member` ("a family member"), never a guess.
function decidedByOf(event: { type: string; payload: unknown }, familyMemberIds: ReadonlySet<string>): { decidedBy?: string } {
  const payload = event.payload as { decidedBy?: unknown; actorId?: unknown } | null;
  const own = payload?.decidedBy;
  let decidedBy = typeof own === 'string' ? own.slice(0, 80) : ACTIVITY.decidedByDefault[event.type];
  if (decidedBy === ACTIVITY.member && typeof payload?.actorId === 'string' && familyMemberIds.has(payload.actorId)) {
    decidedBy = `${ACTIVITY.member}:${payload.actorId}`;
  }
  return decidedBy ? { decidedBy } : {};
}

export const activity = query({
  ...pick(API.megas.activity),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireAdmin(viewer.member.role);
    const page = await ctx.db
      .query('familyEvents')
      .withIndex('by_family_at', (q) => q.eq('familyId', viewer.member.familyId))
      .order('desc')
      .paginate(args.paginationOpts);
    const familyMembers = await ctx.db
      .query('members')
      .withIndex('by_family', (q) => q.eq('familyId', viewer.member.familyId))
      .collect();
    const ids = new Set<string>(familyMembers.map((m) => m._id));
    return { ...page, page: page.page.map((e) => ({ at: e.at, type: e.type, summary: summarize(e), ...decidedByOf(e, ids) })) };
  },
});
