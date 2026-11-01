import { COORDINATION_COPY } from '../../shared/config/scheduling';
import { enqueueCardCandidate } from './proactive';
import { ageGroupOf } from '../../shared/ageGroups';
import type { BlockAnswer } from '../../shared/domain/messages';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { clock } from '../ports/clock';
import { fail } from './errors';
import { parentOf } from './viewer';
import { postOwnMegaMessage } from './threads';

export async function requestConnectionApproval(ctx: MutationCtx, member: Doc<'members'>) {
  const now = clock.realNow();
  if (ageGroupOf(member, new Date(now).toISOString().slice(0,10)) !== 'teen') fail('FORBIDDEN', 'Only teens can request parent approval for account connections.');
  if (member.connectionsApprovedBy || member.connectionRequest?.status === 'pending') return;
  if (member.connectionRequest && now - member.connectionRequest.at < 60_000) fail('VALIDATION', 'Please wait before asking again.');
  const relations = await ctx.db.query('relationships').withIndex('by_family_from', q => q.eq('familyId', member.familyId)).collect();
  const parents = [...new Set(relations.filter(r => r.to === member._id && r.kind === 'parent').map(r => r.from))];
  const messageIds: Id<'messages'>[] = [];
  for (const id of parents) {
    const parent = await ctx.db.get(id);
    if (!parent || !['admin','adult'].includes(parent.role)) continue;
    const messageId = await postOwnMegaMessage(ctx, member.familyId, id, { type: 'block', block: {
      kind: 'choice', prompt: `${member.name} would like to connect Google so their MEGA can help with email and schedules. Allow account connections? Their inbox stays private, and they still choose their Google permissions.`,
      options: [{ id: 'approve', label: 'Allow connections' }, { id: 'deny', label: 'Not now' }], multi: false, allowOther: false,
    } }, now, { ruleBlock: 'connectionApproval' });
    if (messageId) messageIds.push(messageId);
  }
  if (!messageIds.length) fail('VALIDATION', 'A parent needs a MEGA before they can receive this request.');
  await ctx.db.patch(member._id, { connectionRequest: { at: now, status: 'pending', messageIds } });
  for (const messageId of messageIds) {
    const message = await ctx.db.get(messageId);
    const thread = message ? await ctx.db.get(message.threadId) : null;
    if (thread) await enqueueCardCandidate(ctx, { familyId: member.familyId, recipientId: thread.ownerId, kind: 'update',
      dedupeKey: `connectionApproval:${messageId}`, title: COORDINATION_COPY.approvalTitle, text: COORDINATION_COPY.approvalBody,
      source: { kind: 'connectionApproval', memberId: member._id, messageId, requestedAt: now }, now });
  }
  await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: 'I asked your parent to approve account connections. Once they approve, open Connect Google here to continue.' }, now);
}

export async function answerConnectionApproval(ctx: MutationCtx, parent: Doc<'members'>, message: Doc<'messages'>, answer: BlockAnswer, now: number) {
  if (message.ruleBlock !== 'connectionApproval') return false;
  const children = await parentOf(ctx, parent.familyId, parent._id);
  const members = await Promise.all(children.map(id => ctx.db.get(id)));
  const child = members.find(m => m?.connectionRequest?.messageIds.includes(message._id));
  if (!child || !['admin','adult'].includes(parent.role)) fail('FORBIDDEN');
  const request = child.connectionRequest!;
  if (request.status !== 'pending') return true;
  if (ageGroupOf(child, new Date(clock.realNow()).toISOString().slice(0,10)) !== 'teen') fail('FORBIDDEN');
  const decision = answer.optionIds?.[0];
  if (answer.optionIds?.length !== 1 || !['approve','deny'].includes(decision!)) fail('VALIDATION');
  const approved = decision === 'approve';
  await ctx.db.patch(child._id, { connectionsApprovedBy: approved ? parent._id : undefined, connectionsApprovedAt: approved ? clock.realNow() : undefined, connectionRequest: { ...request, status: approved ? 'approved' : 'denied' } });
  for (const id of request.messageIds) {
    const m = await ctx.db.get(id);
    if (m?.body.type === 'block') await ctx.db.patch(id, { body: { ...m.body, answeredWith: { optionIds: [decision!] } } });
  }
  await postOwnMegaMessage(ctx, child.familyId, child._id, { type: 'text', text: approved ? `${parent.name} approved account connections. You can now connect Google; you choose what to allow and share.` : `${parent.name} chose not to allow account connections right now. We can still plan together in chat.` }, now);
  if (approved) await postOwnMegaMessage(ctx, child.familyId, child._id, { type: 'card', card: { kind: 'connect', offer: 'gmail' } }, now);
  return true;
}
