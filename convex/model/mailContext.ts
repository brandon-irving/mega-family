import type { MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { BlockAnswer } from '../../shared/domain/messages';
import { clock } from '../ports/clock';
import { connectorAllowed, statusOf } from './integrations';
import { postOwnMegaMessage } from './threads';
import { applyLearningDecision } from './applyLearning';
import { decideLearning, type LearningOp } from './learningPolicy';
import { fail } from './errors';

export async function suggestMailLocation(ctx: MutationCtx, args: { integrationId: Id<'integrations'>; sourceMessageId: string; location: string }) {
  const row = await ctx.db.get(args.integrationId);
  if (!row?.memberId || row.kind !== 'gmail' || statusOf(row) !== 'connected') return;
  const member = await ctx.db.get(row.memberId);
  if (!member || !connectorAllowed(member)) return;
  const pref = await ctx.db.query('schedulingPreferences').withIndex('by_family_member', q => q.eq('familyId', member.familyId).eq('memberId', member._id)).unique();
  if (!pref?.enabled || args.location.length > 125) return;
  const runs = await ctx.db.query('demoRuns').withIndex('by_family', q => q.eq('familyId', member.familyId)).collect();
  if (runs.length && !runs.some(r => r.active && r.jobs.some(j => j.sourceMessageId === args.sourceMessageId))) return;
  // One question per person: retries and subsequent emails must not nag or overwrite their answer.
  const previous = await ctx.db.query('mailContextSuggestions').withIndex('by_owner', q => q.eq('familyId', member.familyId).eq('ownerId', member._id)).first();
  if (previous) return;
  const now = await clock.now(ctx, member.familyId);
  const messageId = await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'block', block: {
    kind: 'choice', prompt: `An email suggests you’re based in ${args.location}. Is that right, and may I remember it privately to make my suggestions more useful?`,
    options: [{ id: 'save', label: 'Yes, remember privately' }, { id: 'no', label: 'That’s not right' }, { id: 'skip', label: 'Don’t save' }], multi: false, allowOther: false,
  } }, now, { ruleBlock: 'mailLocation' });
  if (messageId) await ctx.db.insert('mailContextSuggestions', { ...args, familyId: member.familyId, ownerId: member._id, createdAt: now, status: 'pending', messageId });
}

export async function answerMailLocation(ctx: MutationCtx, member: Doc<'members'>, message: Doc<'messages'>, answer: BlockAnswer, now: number) {
  if (message.ruleBlock !== 'mailLocation') return false;
  const suggestion = await ctx.db.query('mailContextSuggestions').withIndex('by_message', q => q.eq('messageId', message._id)).unique();
  if (!suggestion || suggestion.ownerId !== member._id || suggestion.familyId !== member.familyId) fail('FORBIDDEN');
  if (suggestion.status !== 'pending') return true;
  const choice = answer.optionIds?.[0];
  if (answer.optionIds?.length !== 1 || !['save','no','skip'].includes(choice!)) fail('VALIDATION');
  if (choice === 'save') {
    const op: LearningOp = { trigger: 'explicit', kind: 'fact', text: `${member.name} is based in ${suggestion.location}.`, suggestedScope: 'personal', confidence: 1, sensitive: true, about: [member._id] };
    const saved = await applyLearningDecision(ctx, { familyId: member.familyId, memberId: member._id, role: member.role, megaId: message.author.kind === 'mega' ? message.author.id : null, threadId: message.threadId, now }, op, decideLearning(op, member._id));
    if (saved.memoryId) await ctx.db.patch(saved.memoryId, { source: { kind: 'message', ref: message._id } });
    const reply = await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: 'Remembered privately. I can use that for local suggestions; I haven’t shared it with your family.' }, now);
    if (reply && saved.chip) await ctx.db.patch(reply, { chips: [saved.chip] });
  } else await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: choice === 'no' ? 'Thanks for correcting that. I haven’t saved a location. You can tell me where you’re based if you’d like.' : 'No problem. I haven’t saved a location.' }, now);
  await ctx.db.patch(suggestion._id, { status: choice === 'save' ? 'saved' : 'dismissed' });
  return true;
}
