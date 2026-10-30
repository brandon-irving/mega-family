import { GIFT_LIST_NAME } from '../../shared/config/copy';
import type { Doc } from '../_generated/dataModel';

/** Gift rows retain their recipient restriction everywhere lists are read or changed.
 * Old gift-list rows without provenance are hidden until they can be matched to their source. */
export function canSeeListItem(member: Pick<Doc<'members'>, '_id' | 'role'>, item: Doc<'listItems'>, list: Doc<'lists'>): boolean {
  if (item.giftForMemberId) return member.role !== 'kid' && member._id !== item.giftForMemberId;
  return !(list.name === GIFT_LIST_NAME && list.scope === 'adults');
}

/** Restore provenance for old gift-list copies when their exact source is unambiguous. */
export async function restoreGiftListProvenance(ctx: import('../_generated/server').MutationCtx, familyId: Doc<'families'>['_id'], sets: Doc<'giftIdeas'>[]) {
  const lists = await ctx.db.query('lists').withIndex('by_family', q => q.eq('familyId', familyId)).collect();
  const gifts = lists.filter(list => list.name === GIFT_LIST_NAME && list.scope === 'adults');
  if (!gifts.length) return;
  const recipientsByText = new Map<string, Set<Doc<'members'>['_id']>>();
  for (const set of sets) {
    const recipient = await ctx.db.get(set.forMemberId);
    if (!recipient) continue;
    for (const idea of set.ideas) {
      const text = `${idea.title} (for ${recipient.name})`;
      const ids = recipientsByText.get(text) ?? new Set();
      ids.add(recipient._id);
      recipientsByText.set(text, ids);
    }
  }
  for (const list of gifts) {
    const items = await ctx.db.query('listItems').withIndex('by_family_list', q => q.eq('familyId', familyId).eq('listId', list._id)).take(500);
    for (const item of items) {
      const ids = recipientsByText.get(item.text);
      if (!item.giftForMemberId && ids?.size === 1) await ctx.db.patch(item._id, { giftForMemberId: [...ids][0] });
    }
  }
}
