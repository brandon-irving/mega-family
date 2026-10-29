// CONTRACT §4 `mail.*` (G5, v0.17): what MEGA found in Gmail. Owner only: any other member (the admin included)
// or another family gets NOT_FOUND per item. A found item never carries the sender's address or the body.
import type { MailItemView } from '../shared/domain/api';
import { API } from '../shared/domain/api';
import { mutation, query } from './_generated/server';
import { pick } from './model/define';
import { fail } from './model/errors';
import { requireViewer } from './model/viewer';

export const items = query({
  ...pick(API.mail.items),
  handler: async (ctx, { itemIds }) => {
    const viewer = await requireViewer(ctx);
    const out: MailItemView[] = [];
    for (const id of itemIds.slice(0, 50)) {
      const item = await ctx.db.get(id);
      if (!item || item.familyId !== viewer.member.familyId || item.memberId !== viewer.member._id) fail('NOT_FOUND');
      out.push({
        itemId: item._id,
        kind: item.kind,
        title: item.title,
        sourceLabel: item.sourceLabel,
        when: item.when,
        amountCents: item.amountCents,
        status: item.status,
        eventId: item.eventId,
        reminderId: item.reminderId,
      });
    }
    return out;
  },
});

export const dismiss = mutation({
  ...pick(API.mail.dismiss),
  handler: async (ctx, { itemId }) => {
    const viewer = await requireViewer(ctx);
    const item = await ctx.db.get(itemId);
    if (!item || item.familyId !== viewer.member.familyId || item.memberId !== viewer.member._id) fail('NOT_FOUND');
    if (item.status === 'dismissed') return null;
    // Remove the private copy it made; an event the owner already shared is household data now and stays.
    if (item.eventId) {
      const event = await ctx.db.get(item.eventId);
      if (event && event.scope === 'personal' && event.ownerId === viewer.member._id) await ctx.db.delete(event._id);
    }
    if (item.reminderId) {
      const reminder = await ctx.db.get(item.reminderId);
      if (reminder && reminder.forMemberId === viewer.member._id) await ctx.db.delete(reminder._id);
    }
    await ctx.db.patch(item._id, { status: 'dismissed', eventId: undefined, reminderId: undefined });
    return null;
  },
});
