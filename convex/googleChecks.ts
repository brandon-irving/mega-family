import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { connectorAllowed, statusOf } from './model/integrations';
import { GOOGLE_CHECK } from '../shared/config/google';

/** Follow only an explicit chat request. Background polling stays quiet. */
export const complete = internalMutation({
  args: {
    messageId: v.id('messages'), memberId: v.id('members'), startedAt: v.number(), attempt: v.number(),
    sources: v.array(v.object({ id: v.id('integrations'), previousSync: v.optional(v.number()), needsFresh: v.boolean() })),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    const member = await ctx.db.get(args.memberId);
    if (!message || !member || message.familyId !== member.familyId || message.body.type !== 'notice') return;
    const thread = await ctx.db.get(message.threadId);
    if (!thread || thread.ownerId !== member._id || !(await connectorAllowed(ctx, member))) return;
    let pending = false;
    let calendarChecked = false;
    let backlog = false;
    const failed: string[] = [];
    for (const source of args.sources) {
      const row = await ctx.db.get(source.id);
      if (!row || row.memberId !== member._id || row.familyId !== member.familyId) { failed.push('a connection'); continue; }
      const name = row.kind === 'gmail' ? 'Gmail' : 'Calendar';
      const progressed = row.lastSyncAt !== undefined && row.lastSyncAt !== source.previousSync;
      if (row.kind === 'googleCalendar') calendarChecked = true;
      if (row.kind === 'gmail' && Array.isArray((row.config as { pending?: unknown[] })?.pending) && (row.config as { pending: unknown[] }).pending.length) backlog = true;
      if (row.lastFailure && (row.lastFailureAt ?? 0) >= args.startedAt) failed.push(name);
      else if (statusOf(row) !== 'connected') failed.push(name);
      else if (source.needsFresh && !progressed) pending = true;
      else if (row.lastFailure) failed.push(name);
    }
    if (pending && args.attempt < GOOGLE_CHECK.maxPolls) {
      await ctx.scheduler.runAfter(GOOGLE_CHECK.pollMs, internal.googleChecks.complete, { ...args, attempt: args.attempt + 1 });
      return;
    }
    const messages = await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', member.familyId).eq('threadId', message.threadId)).order('desc').take(50);
    const found = messages.some(m => m._creationTime >= args.startedAt && m.body.type === 'card' && ['mailFound', 'mailPlan'].includes(m.body.card.kind));
    const plans = await ctx.db.query('mailPlans').withIndex('by_owner', q => q.eq('familyId', member.familyId).eq('ownerId', member._id)).collect();
    const updated = plans.some(p => p.updatedAt >= args.startedAt);
    const text = failed.length ? `I couldn’t finish checking ${failed.join(' and ')}. Please review the connection in Settings and try again. I can’t confirm that nothing needs attention.`
      : pending ? 'The check is taking longer than expected. I haven’t confirmed the results yet—please try again shortly.'
      : backlog ? 'This pass is complete, but more Inbox messages are waiting to be checked. Any findings so far appear in this chat; I can’t give an all-clear yet.'
      : found || updated ? 'Check complete. I found new or updated items; you can review them in the cards in this chat.'
      : `Check complete. I found no new items to add from the Inbox check.${calendarChecked ? ' Your connected calendar is up to date.' : ''} Previously found items are still available in this chat. Spam isn’t included.`;
    await ctx.db.patch(message._id, { body: { type: 'text', text } });
  },
});
