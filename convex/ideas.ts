import { API } from '../shared/domain/api';
import { localDate } from '../shared/time';
import { IDEAS } from '../shared/config/ideas';
import { GIFTS } from '../shared/config/calendar';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { indexGiftIdeas, ideaAudience, putIdea, requireIdea } from './model/ideas';
import { restoreGiftListProvenance } from './model/listAccess';
import { nextBirthday } from './model/gifts';
import { requireNotKid, requireViewer } from './model/viewer';
import { clock } from './ports/clock';

export const list = query({
  ...pick(API.ideas.list),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireNotKid(viewer.member.role);
    const familyId = viewer.member.familyId;
    const ownerId = viewer.member._id;
    const search = args.search?.trim().slice(0, IDEAS.searchMaxLength);
    const options = { ...args.paginationOpts, numItems: Math.min(IDEAS.maxPageSize, args.paginationOpts.numItems), maximumRowsRead: IDEAS.maximumRowsRead };
    const rows = search
      ? await ctx.db.query('ideas').withSearchIndex('search_text', q => {
        let filter = q.search('searchText', search).eq('familyId', familyId).eq('ownerId', ownerId).eq('dismissed', false);
        if (args.category) filter = filter.eq('category', args.category);
        if (args.saved !== undefined) filter = filter.eq('saved', args.saved);
        return filter;
      }).paginate(options)
      : await ctx.db.query('ideas').withIndex('by_family_owner_at', q => q.eq('familyId', familyId).eq('ownerId', ownerId))
        .order((args.sort ?? IDEAS.defaultSort) === 'oldest' ? 'asc' : 'desc').filter(q => q.and(q.eq(q.field('dismissed'), false),
          args.category ? q.eq(q.field('category'), args.category) : true,
          args.saved !== undefined ? q.eq(q.field('saved'), args.saved) : true)).paginate(options);
    const checked = await Promise.all(rows.page.map(async idea => {
      const audience = await ideaAudience(ctx, viewer, idea);
      return audience ? { ...idea, audience } : null;
    }));
    return { ...rows, page: checked.filter((idea): idea is NonNullable<typeof idea> => idea !== null) };
  },
});

export const get = query({ ...pick(API.ideas.get), handler: async (ctx, args) => requireIdea(ctx, await requireViewer(ctx), args.ideaId) });

export const saveMessage = mutation({
  ...pick(API.ideas.saveMessage),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireNotKid(viewer.member.role);
    const message = await ctx.db.get(args.messageId);
    const thread = message ? await ctx.db.get(message.threadId) : null;
    if (!message || message.familyId !== viewer.member.familyId || thread?.ownerId !== viewer.member._id) fail('NOT_FOUND');
    if (message.author.kind !== 'mega' || message.body.type !== 'text' || !message.body.text.trim()) fail('VALIDATION', 'Choose a MEGA reply to save.');
    const text = message.body.text.trim();
    if (text.length > 20000) fail('VALIDATION', 'This reply is too long to save as one idea.');
    // Reuse an automatically indexed suggestion from this reply when possible.
    const existing = await ctx.db.query('ideas').withIndex('by_family_owner_source', q => q.eq('familyId', message.familyId).eq('ownerId', viewer.member._id).eq('sourceKey', `message:${message._id}`)).unique();
    if (existing) { await ctx.db.patch(existing._id, { saved: true, dismissed: false, ...(args.category ? { category: args.category } : {}) }); return existing._id; }
    return putIdea(ctx, { familyId: message.familyId, ownerId: viewer.member._id, title: text.split(/\n|(?<=[.!?])\s/)[0].slice(0, 100), text,
      category: args.category ?? 'other', source: { kind: 'message', messageId: message._id }, sourceKey: `message:${message._id}`, saved: true, at: message.at });
  },
});

export const setSaved = mutation({ ...pick(API.ideas.setSaved), handler: async (ctx, args) => {
  const idea = await requireIdea(ctx, await requireViewer(ctx), args.ideaId);
  await ctx.db.patch(idea._id, { saved: args.saved, dismissed: false }); return null;
} });
export const dismiss = mutation({ ...pick(API.ideas.dismiss), handler: async (ctx, args) => {
  const idea = await requireIdea(ctx, await requireViewer(ctx), args.ideaId);
  await ctx.db.patch(idea._id, { dismissed: true, saved: false }); return null;
} });
export const categorize = mutation({ ...pick(API.ideas.categorize), handler: async (ctx, args) => {
  const idea = await requireIdea(ctx, await requireViewer(ctx), args.ideaId);
  if (idea.source.kind === 'gift' && args.category !== 'gifts') fail('VALIDATION', 'Gift suggestions stay in Gifts.');
  await ctx.db.patch(idea._id, { category: args.category }); return null;
} });

// Bring existing upcoming gifts into a newly opened collection. New sets are indexed when delivered.
// Bounded to the latest 100 sets, so opening this screen never reads a family's complete history.
export const refreshGifts = mutation({ ...pick(API.ideas.refreshGifts), handler: async ctx => {
  const viewer = await requireViewer(ctx);
  requireNotKid(viewer.member.role);
  const today = localDate(await clock.now(ctx, viewer.member.familyId), viewer.family.timezone);
  const sets = await ctx.db.query('giftIdeas').withIndex('by_family_created', q => q.eq('familyId', viewer.member.familyId)).order('desc').take(100);
  await restoreGiftListProvenance(ctx, viewer.member.familyId, sets);
  for (const set of sets) {
    if (set.date >= today && nextBirthday(set.date, today).daysAway <= GIFTS.lookaheadDays) await indexGiftIdeas(ctx, set, viewer.member);
  }
  return null;
} });
