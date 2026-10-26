// CONTRACT §4 "Today, status, widgets": `today.get`.
import { API } from '../shared/domain/api';
import { query } from './_generated/server';
import { pick } from './model/define';
import { topStatementCandidate, todaysEvents, visibleLists } from './model/home';
import { requireViewer } from './model/viewer';

export const get = query({
  ...pick(API.today.get),
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const familyId = viewer.member.familyId;

    const openRequests = await ctx.db
      .query('requests')
      .withIndex('by_family_to', (q) => q.eq('familyId', familyId).eq('toMemberId', viewer.member._id))
      .collect();
    const myNotifications = await ctx.db
      .query('notifications')
      .withIndex('by_family_recipient', (q) => q.eq('familyId', familyId).eq('recipientId', viewer.member._id))
      .collect();

    const openForYou = openRequests.filter((r) => r.status === 'open');
    // G1 fix: a request's own notification (seed.ts links them via `requests.notificationId`) used to be
    // listed twice — once as the request, once as the notification it's pushed through. Once its request
    // is already in the list, the notification is just that request's delivery mechanism, not a second
    // separate thing waiting on you.
    const linkedNotificationIds = new Set(openForYou.map((r) => r.notificationId).filter((id) => id !== undefined));

    const waitingOnYou = [
      ...openForYou.map((request) => ({ kind: 'request' as const, request })),
      ...myNotifications
        .filter((n) => n.sentAt !== undefined && n.answer === undefined && n.buttons.length > 0 && !linkedNotificationIds.has(n._id))
        .map((notification) => ({ kind: 'notification' as const, notification })),
    ];

    const statementCandidate = await topStatementCandidate(ctx, viewer);
    const statement = statementCandidate && viewer.mega ? { text: statementCandidate.draft.text, candidateId: statementCandidate._id, megaId: viewer.mega._id } : null;

    return {
      events: await todaysEvents(ctx, viewer),
      waitingOnYou,
      lists: await visibleLists(ctx, viewer),
      statement,
    };
  },
});
