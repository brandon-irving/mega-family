import { CONNECTION_CATALOG, CONNECTION_COPY as C, rankConnections, type ConnectionCapability } from '../../shared/config/connections';
import { memberAgeGroup } from './memberAge';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { BlockAnswer } from '../../shared/domain/messages';
import { memberIntegrations, statusOf } from './integrations';
import { googleAvailable } from './tokenVault';
import { offerGoogleSetup } from './googleSetup';
import { postOwnMegaMessage } from './threads';
import { fail } from './errors';

const adapters = {
  google: {
    available: googleAvailable,
    capabilities: { gmail: 'correspondence', googleCalendar: 'availability' } as Record<string, ConnectionCapability>,
    open: async (...args: Parameters<typeof offerGoogleSetup>) => {
      const result = await offerGoogleSetup(...args);
      return result.startsWith('Google setup is available') ? null : result;
    },
  },
};

/** Uses only the caller's own context, or the creator's proposed brief for an unjoined person. */
export async function recommendConnection(ctx: MutationCtx, owner: Doc<'members'>, context: string, now: number, options: { subject?: Doc<'members'>; allowBaseline?: boolean } = {}) {
  const subject = options.subject ?? owner;
  const creator = subject._id !== owner._id;
  if (subject.familyId !== owner.familyId || (creator && (owner.role !== 'admin' || subject.authId || subject.joinedAt !== undefined))) fail('FORBIDDEN');
  const previous = await ctx.db.query('connectionSuggestions').withIndex('by_owner_subject', q => q.eq('familyId', owner.familyId).eq('ownerId', owner._id).eq('subjectId', subject._id)).collect();
  const excluded = previous.map(r => r.providerId);
  if (!creator) {
    const creatorChoices = await ctx.db.query('connectionSuggestions').withIndex('by_subject', q => q.eq('familyId', owner.familyId).eq('subjectId', owner._id)).collect();
    // A creator's permission only controls this proactive suggestion, never the recipient's manual setup.
    excluded.push(...creatorChoices.filter(r => r.mode === 'creator' && r.status === 'declined').map(r => r.providerId));
  }
  const connected: ConnectionCapability[] = [];
  // Never inspect or disclose another person's connected accounts to a creator.
  if (!creator) {
    for (const row of await memberIntegrations(ctx, owner.familyId, owner._id)) {
      if (statusOf(row) === 'connected') {
        for (const adapter of Object.values(adapters)) {
          const capability = adapter.capabilities[row.kind];
          if (capability) connected.push(capability);
        }
      }
    }
  }
  const onboarding = !creator ? await ctx.db.query('onboarding').withIndex('by_family_member', q => q.eq('familyId', owner.familyId).eq('memberId', owner._id)).unique() : null;
  const available = CONNECTION_CATALOG.filter(p => adapters[p.setup as keyof typeof adapters]?.available()).map(p => p.id);
  if (onboarding?.outcomes.gmail === 'skipped') excluded.push('google');
  const candidate = rankConnections({ context, ageGroup: await memberAgeGroup(ctx, subject), connected, available, excluded, allowBaseline: options.allowBaseline })[0];
  if (!candidate) return false;
  const prompt = creator ? C.creator(subject.name, candidate.label, candidate.reason) : C.own(candidate.label, candidate.reason) + '\n\n' + C.optional;
  const messageId = await postOwnMegaMessage(ctx, owner.familyId, owner._id, { type: 'block', block: { kind: 'choice', prompt, multi: false, allowOther: false, options: [
    { id: 'connect', label: creator ? C.creatorAccept : C.accept }, { id: 'decline', label: creator ? C.creatorDecline : C.decline },
  ] } }, now, { ruleBlock: 'connectionSuggestion' });
  if (!messageId) return false;
  await ctx.db.insert('connectionSuggestions', { familyId: owner.familyId, ownerId: owner._id, subjectId: subject._id, providerId: candidate.providerId, reason: candidate.reason, mode: creator ? 'creator' : 'own', status: 'pending', messageId, createdAt: now, updatedAt: now });
  return true;
}

export async function answerConnectionRecommendation(ctx: MutationCtx, member: Doc<'members'>, message: Doc<'messages'>, answer: BlockAnswer, now: number) {
  if (message.ruleBlock !== 'connectionSuggestion') return false;
  const row = await ctx.db.query('connectionSuggestions').withIndex('by_message', q => q.eq('familyId', member.familyId).eq('messageId', message._id)).unique();
  if (!row || row.ownerId !== member._id) fail('FORBIDDEN');
  if (row.status !== 'pending') return true;
  const picked = answer.optionIds?.[0];
  if (answer.optionIds?.length !== 1 || !['connect', 'decline'].includes(picked!)) fail('VALIDATION');
  await ctx.db.patch(row._id, { status: picked === 'connect' ? 'accepted' : 'declined', updatedAt: now });
  if (picked === 'connect' && row.mode === 'own') {
    const provider = CONNECTION_CATALOG.find(p => p.id === row.providerId);
    const adapter = provider && adapters[provider.setup as keyof typeof adapters];
    if (!adapter) fail('VALIDATION', 'This connection is not available.');
    const result = await adapter.open(ctx, member, message.threadId, now);
    // Adapter still enforces live configuration and age/permission constraints.
    if (result) await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: result }, now);
  } else await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: picked === 'connect' ? C.approved : C.declined }, now);
  return true;
}


/** A plain yes/no answers only the latest MEGA question, never an older unrelated recommendation. */
export async function answerConnectionRecommendationText(ctx: MutationCtx, member: Doc<'members'>, threadId: Doc<'threads'>['_id'], text: string, now: number) {
  const normalized = text.toLowerCase().replace(/[.,!?]/g, '').trim();
  const choice = ['yes', 'yes please', 'sounds good', 'yes ask them'].includes(normalized) ? 'connect' : ['no', 'no thanks', 'not now', 'skip'].includes(normalized) ? 'decline' : null;
  if (!choice) return null;
  const recent = await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', member.familyId).eq('threadId', threadId)).order('desc').take(12);
  const last = recent.find(m => m.author.kind === 'mega');
  if (last?.ruleBlock !== 'connectionSuggestion' || last.body.type !== 'block' || last.body.answeredWith) return null;
  const answer = { optionIds: [choice] };
  await answerConnectionRecommendation(ctx, member, last, answer, now);
  await ctx.db.patch(last._id, { body: { ...last.body, answeredWith: answer } });
  const newest = await ctx.db.query('messages').withIndex('by_family_thread_at', q => q.eq('familyId', member.familyId).eq('threadId', threadId)).order('desc').first();
  if (newest?.author.kind === 'mega' && newest.body.type === 'text') return { replyMessageId: newest._id, text: newest.body.text };
  const replyMessageId = await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: C.setupReady }, now);
  return replyMessageId ? { replyMessageId, text: C.setupReady } : null;
}
