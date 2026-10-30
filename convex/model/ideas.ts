import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Viewer } from '../../shared/domain/api';
import { canSeeGiftsFor } from './gifts';
import { fail } from './errors';

type Ctx = QueryCtx | MutationCtx;

export async function ideaAudience(ctx: Ctx, viewer: Viewer, idea: Doc<'ideas'>): Promise<string | null> {
  if (viewer.member.role === 'kid' || idea.familyId !== viewer.member.familyId || idea.ownerId !== viewer.member._id) return null;
  if (idea.source.kind === 'gift') {
    const set = await ctx.db.get(idea.source.giftIdeasId);
    if (!set || set.familyId !== idea.familyId || set.status !== 'ready' || !set.ideas[idea.source.index] || !canSeeGiftsFor(viewer.member, set.forMemberId)) return null;
    const recipient = await ctx.db.get(set.forMemberId);
    return `Adults · hidden from ${recipient?.name ?? 'recipient'}`;
  }
  const messageId = idea.source.messageId;
  if (messageId) {
    const message = await ctx.db.get(messageId);
    const thread = message ? await ctx.db.get(message.threadId) : null;
    if (!message || message.familyId !== idea.familyId || thread?.ownerId !== viewer.member._id) return null;
  }
  return 'Only you';
}

export async function requireIdea(ctx: Ctx, viewer: Viewer, id: Id<'ideas'>) {
  const idea = await ctx.db.get(id);
  const audience = idea ? await ideaAudience(ctx, viewer, idea) : null;
  if (!idea || !audience) fail('NOT_FOUND');
  return { ...idea, audience };
}

type NewIdea = Omit<Doc<'ideas'>, '_id' | '_creationTime' | 'searchText' | 'dismissed'>;
export async function putIdea(ctx: MutationCtx, idea: NewIdea): Promise<Id<'ideas'>> {
  const existing = await ctx.db.query('ideas').withIndex('by_family_owner_source', q => q.eq('familyId', idea.familyId).eq('ownerId', idea.ownerId).eq('sourceKey', idea.sourceKey)).unique();
  if (existing) {
    // Automatic suggestions never undo a person's save or dismissal.
    if (idea.saved) await ctx.db.patch(existing._id, { saved: true, dismissed: false });
    return existing._id;
  }
  return ctx.db.insert('ideas', { ...idea, dismissed: false, searchText: `${idea.title} ${idea.text}` });
}

export async function indexGiftIdeas(ctx: MutationCtx, set: Doc<'giftIdeas'>, member: Doc<'members'>) {
  if (set.status !== 'ready' || set.familyId !== member.familyId || !canSeeGiftsFor(member, set.forMemberId)) return;
  for (let index = 0; index < set.ideas.length; index++) {
    const gift = set.ideas[index];
    await putIdea(ctx, { familyId: set.familyId, ownerId: member._id, title: gift.title, text: gift.why,
      category: 'gifts', source: { kind: 'gift', giftIdeasId: set._id, index }, sourceKey: `gift:${set._id}:${index}`,
      saved: false, at: set.createdAt });
  }
}
