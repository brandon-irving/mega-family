import { ageGroupFromBrief, ageGroupOf, AGE_GROUP_LABELS } from '../../shared/ageGroups';
import { ASSISTANT_BRIEF } from '../../shared/config/assistantBrief';
import { MEGA_CREATION as C } from '../../shared/config/megaCreation';
import { ONBOARDING } from '../../shared/config/onboarding';
import { COLORS, HEX_RE } from '../../shared/config/looks';
import { STICKERS } from '../../shared/config/ids';
import { PERSONALITIES, RELATIONSHIPS } from '../../shared/domain/enums';
import type { MegaDraftData } from '../../shared/domain/megaCreation';
import type { BlockAnswer } from '../../shared/domain/messages';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { addFamilyMember, defaultInviteMega, giveMega } from './familyAdd';
import { briefFor, checkedBrief, saveBrief } from './assistantBriefs';
import { postOwnMegaMessage } from './threads';
import { onboardingRow } from './integrations';
import { fail } from './errors';

import { parentOf } from './viewer';
import { clock } from '../ports/clock';

type Draft = Doc<'megaDrafts'>;
export async function activeDraft(ctx: QueryCtx, member: Doc<'members'>) {
  const rows = await ctx.db.query('megaDrafts').withIndex('by_family_creator', q => q.eq('familyId', member.familyId).eq('creatorId', member._id)).order('desc').take(30);
  return rows.find(d => d.status === 'draft' || d.status === 'review') ?? null;
}

async function ownedDraft(ctx: QueryCtx, member: Doc<'members'>, id: unknown) {
  if (typeof id !== 'string') fail('VALIDATION', 'Choose a draft.');
  const normalized = ctx.db.normalizeId('megaDrafts', id);
  const row = normalized ? await ctx.db.get(normalized) : null;
  if (!row || row.familyId !== member.familyId || row.creatorId !== member._id) fail('NOT_FOUND');
  return row;
}

async function invalidateReview(ctx: MutationCtx, row: Draft) {
  const message = row.reviewMessageId ? await ctx.db.get(row.reviewMessageId) : null;
  if (message?.body.type === 'block' && !message.body.answeredWith) await ctx.db.patch(message._id, { body: { ...message.body, answeredWith: { value: 'Updated in chat' } } });
}

export async function startCreation(ctx: MutationCtx, member: Doc<'members'>, threadId: Id<'threads'>, now: number) {
  if (member.role === 'kid') fail('FORBIDDEN');
  const existing = await activeDraft(ctx, member);
  if (existing) return existing;
  const look = await defaultInviteMega(ctx, member);
  const id = await ctx.db.insert('megaDrafts', { familyId: member.familyId, creatorId: member._id, threadId,
    data: { target: 'new', megaName: look.name, hex: look.look.hex, sticker: look.look.sticker, personality: look.personality },
    status: 'draft', revision: 1, updatedAt: now });
  return (await ctx.db.get(id))!;
}

/** Carry an in-progress form conversation into the conversational draft without losing the person. */
export async function migrateCreation(ctx: MutationCtx, member: Doc<'members'>, threadId: Id<'threads'>, now: number) {
  const row = await onboardingRow(ctx, member.familyId, member._id);
  if (row?.step !== 'family') return;
  let draft = await activeDraft(ctx, member);
  if (!draft) {
    draft = await startCreation(ctx, member, threadId, now);
    const person = row.personId ? await ctx.db.get(row.personId) : null;
    if (person) {
      const look = await defaultInviteMega(ctx, person);
      const brief = await briefFor(ctx, member.familyId, person._id);
      await ctx.db.patch(draft._id, { data: { ...draft.data, target: 'existing', memberId: person._id, name: person.name,
        role: person.role === 'kid' ? 'kid' : 'adult', relationship: row.family?.relationship,
        ...(brief ? { brief: brief.proposed } : {}), megaName: look.name, hex: look.look.hex, sticker: look.look.sticker, personality: look.personality } });
    } else if (row.family) await ctx.db.patch(draft._id, { data: { ...draft.data, name: row.family.name, role: row.family.role, relationship: row.family.relationship } });
  }
  const old = row.blockMessageId ? await ctx.db.get(row.blockMessageId) : null;
  if (old?.body.type === 'block' && !old.body.answeredWith) await ctx.db.patch(old._id, { body: { ...old.body, answeredWith: { value: 'Continue in chat' } } });
  await ctx.db.patch(row._id, { step: 'done', finishedAt: now, blockMessageId: undefined, family: undefined });
}

const stringValue = (raw: unknown, max: number = C.maxTextLength): string => {
  if (typeof raw !== 'string' || raw.trim().length > max) fail('VALIDATION', 'Invalid or overlong text.');
  return raw.trim();
};
const enumValue = <T extends string>(raw: unknown, values: readonly T[]): T => {
  if (typeof raw !== 'string' || !values.includes(raw as T)) fail('VALIDATION', 'Unknown choice.');
  return raw as T;
};

export async function updateDraft(ctx: MutationCtx, member: Doc<'members'>, threadId: Id<'threads'>, raw: Record<string, unknown>, now: number) {
  const row = raw.draftId ? await ownedDraft(ctx, member, raw.draftId) : await startCreation(ctx, member, threadId, now);
  if (row.status === 'created' || row.status === 'cancelled') fail('VALIDATION', 'This draft is closed. Start a new draft.');
  let data: MegaDraftData = { ...row.data };
  if (raw.target !== undefined) {
    const target = enumValue(raw.target, ['self', 'new', 'existing'] as const);
    if (target !== data.target) data = { target, megaName: data.megaName, hex: data.hex, sticker: data.sticker, personality: data.personality };
  }
  if (raw.memberId !== undefined) {
    const id = ctx.db.normalizeId('members', stringValue(raw.memberId));
    if (!id) fail('NOT_FOUND');
    data.memberId = id;
  }
  if (data.target === 'self') { data.memberId = member._id; data.name = member.name; }
  if (data.target === 'new') data.memberId = undefined;
  if (data.target !== 'self' && member.role !== 'admin') fail('FORBIDDEN', 'Only the family admin can create another person’s MEGA.');
  if (data.memberId) {
    const person = await ctx.db.get(data.memberId);
    if (!person || person.familyId !== member.familyId) fail('NOT_FOUND');
    if (data.target !== 'self' && (person.authId || person.joinedAt !== undefined)) fail('FORBIDDEN', 'This person controls their own MEGA.');
    if (data.memberId !== row.data.memberId) {
      const look = await defaultInviteMega(ctx, person);
      data = { ...data, role: person.role === 'kid' ? 'kid' : 'adult', ageGroup: person.birthday ? ageGroupOf(person, new Date(clock.realNow()).toISOString().slice(0,10)) : person.ageGroup, accountConnections: undefined, name: person.name, megaName: look.name, hex: look.look.hex, sticker: look.look.sticker, personality: look.personality };
    }
  }
  if (raw.name !== undefined && data.target === 'new') data.name = stringValue(raw.name, ONBOARDING.nameMaxLength);
  if (raw.ageGroup !== undefined) {
    const group = enumValue(raw.ageGroup, ['child','teen','adult'] as const);
    if (group !== data.ageGroup) data.accountConnections = undefined;
    data.ageGroup = group;
  }
  if (raw.accountConnections !== undefined) data.accountConnections = enumValue(raw.accountConnections, ['allow', 'ask'] as const);
  if (raw.role !== undefined) data.role = enumValue(raw.role, ['adult', 'kid'] as const);
  if (raw.relationship !== undefined) data.relationship = enumValue(raw.relationship, RELATIONSHIPS);
  if (raw.megaName !== undefined) data.megaName = stringValue(raw.megaName, 24);
  if (!data.megaName) fail('VALIDATION', 'Give the MEGA a name.');
  if (raw.hex !== undefined) {
    const color = stringValue(raw.hex).toLowerCase();
    data.hex = COLORS[color as keyof typeof COLORS] ?? color;
    if (!HEX_RE.test(data.hex)) fail('VALIDATION', 'Use a preset color or a six-digit hex color.');
  }
  if (raw.sticker !== undefined) data.sticker = enumValue(raw.sticker, STICKERS);
  if (raw.personality !== undefined) data.personality = enumValue(raw.personality, PERSONALITIES);
  if (raw.brief !== undefined) {
    if (raw.brief === null) data.brief = undefined;
    else {
      if (!raw.brief || typeof raw.brief !== 'object' || Array.isArray(raw.brief)) fail('VALIDATION', 'Invalid brief.');
      const fields = { context: '', goal: '', firstTask: '', proactive: '', ...data.brief };
      for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
        const value = (raw.brief as Record<string, unknown>)[key];
        if (value !== undefined) fields[key] = stringValue(value, ASSISTANT_BRIEF.maxFieldLength);
      }
      data.brief = fields;
    }
  }
  if (!data.ageGroup && data.brief) data.ageGroup = ageGroupFromBrief(data.brief.context);
  if (data.ageGroup !== 'teen') data.accountConnections = undefined;
  if (data.role === 'adult' && data.ageGroup && data.ageGroup !== 'adult') fail('VALIDATION', 'Children and teens must use protected kid permissions.');
  await invalidateReview(ctx, row);
  await ctx.db.patch(row._id, { data, status: 'draft', revision: row.revision + 1, reviewMessageId: undefined, updatedAt: now });
  return (await ctx.db.get(row._id))!;
}

export function draftSummary(data: MegaDraftData): string {
  const lines = [data.target === 'self' ? 'Your personal MEGA' : `For ${data.name || 'a family member'}`, `MEGA: ${data.megaName}; color ${data.hex}; sticker ${data.sticker}; ${data.personality} personality`];
  if (data.ageGroup) lines.push(`Age group: ${AGE_GROUP_LABELS[data.ageGroup]}`);
  if (data.accountConnections) lines.push(C.connectionPermissions[data.accountConnections]);
  if (data.relationship) lines.push(`Relationship: ${data.relationship}`);
  if (data.brief) {
    for (const [key, value] of Object.entries(data.brief)) if (value) lines.push(`${key}: ${value}`);
  } else lines.push('No first-day brief yet.');
  return lines.join('\n');
}

async function validateMinorSetup(ctx: QueryCtx, member: Doc<'members'>, data: MegaDraftData) {
  if (data.target === 'self') return;
  const person = data.target === 'existing' && data.memberId ? await ctx.db.get(data.memberId) : null;
  const role = person?.role ?? data.role;
  if (role !== 'kid') return;
  if (!data.ageGroup) fail('VALIDATION', 'Ask how old the child is in chat and save their age group before reviewing.');
  if (person?.birthday && ageGroupOf(person, new Date(clock.realNow()).toISOString().slice(0,10)) !== data.ageGroup) fail('VALIDATION', 'The age group must match the saved birthday.');
  if (data.ageGroup === 'teen') {
    if (!data.accountConnections) fail('VALIDATION', 'Ask the parent whether this teen may connect accounts or must ask for approval first.');
    const isParent = person ? (await parentOf(ctx, member.familyId, member._id)).includes(person._id) : ['daughter', 'son', 'child'].includes(data.relationship ?? '');
    if (!isParent) fail('FORBIDDEN', 'A parent must choose account permissions for this teen.');
  }
}

export async function reviewDraft(ctx: MutationCtx, member: Doc<'members'>, raw: Record<string, unknown>, now: number) {
  const row = await ownedDraft(ctx, member, raw.draftId);
  if (row.status === 'created' || row.status === 'cancelled') fail('VALIDATION', 'This draft is closed.');
  if (row.data.target === 'new' && (!row.data.name || !row.data.role || !row.data.relationship)) fail('VALIDATION', 'Ask in chat for the missing name, adult/kid role, or relationship.');
  if (row.data.target === 'existing' && !row.data.memberId) fail('VALIDATION', 'Choose the existing family member.');

  await validateMinorSetup(ctx, member, row.data);
  if (row.status === 'review' && row.reviewMessageId) return row;
  const messageId = await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'block', block: {
    kind: 'megaDraft', prompt: C.review, draftId: row._id, revision: row.revision, data: row.data,
  } }, now, { ruleBlock: 'creation' });
  if (!messageId) fail('VALIDATION', 'Open your MEGA chat first.');
  await ctx.db.patch(row._id, { status: 'review', reviewMessageId: messageId, updatedAt: now });
  return (await ctx.db.get(row._id))!;
}

/** Only a current review confirmation can commit. UI/text/MCP share this transaction. */
export async function confirmDraft(ctx: MutationCtx, member: Doc<'members'>, draftId: string, revision: number, now: number) {
  const row = await ownedDraft(ctx, member, draftId);
  if (row.status === 'created' && row.revision === revision) return row.resultMemberId!;
  if (row.status !== 'review' || row.revision !== revision) fail('VALIDATION', 'The draft changed. Review the latest version first.');
  const d = row.data;
  if (member.role === 'kid' || (d.target !== 'self' && member.role !== 'admin')) fail('FORBIDDEN');
  await validateMinorSetup(ctx, member, d);
  let personId = d.target === 'self' ? member._id : d.memberId;
  if (d.target === 'new') {
    if (!d.name || !d.role || !d.relationship) fail('VALIDATION', 'Missing person details.');
    const names = await ctx.db.query('members').withIndex('by_family', q => q.eq('familyId', member.familyId)).collect();
    if (names.some(p => p.name.trim().toLowerCase() === d.name!.trim().toLowerCase())) fail('VALIDATION', 'A person with this name already exists. Discuss whether to use their existing profile.');
    personId = await addFamilyMember(ctx, member, { name: d.name, role: d.role, relationship: d.relationship, ageGroup: d.ageGroup }, now);
  }
  const person = personId ? await ctx.db.get(personId) : null;
  if (!person || person.familyId !== member.familyId || (d.target !== 'self' && (person.authId || person.joinedAt !== undefined))) fail('FORBIDDEN');
  if (person.role === 'kid' && d.target !== 'self') {
    await ctx.db.patch(person._id, { ageGroup: d.ageGroup,
      connectionsApprovedBy: d.ageGroup === 'teen' && d.accountConnections === 'allow' ? member._id : undefined,
      connectionsApprovedAt: d.ageGroup === 'teen' && d.accountConnections === 'allow' ? clock.realNow() : undefined });
    const controls = await ctx.db.query('kidControls').withIndex('by_family_member', q => q.eq('familyId', person.familyId).eq('memberId', person._id)).unique();
    if (controls && d.ageGroup === 'teen') await ctx.db.patch(controls._id, { parentsCanReadChat: false });
  }
  await giveMega(ctx, person, { name: d.megaName, look: { hex: d.hex, sticker: d.sticker }, personality: d.personality }, now);
  if (d.brief) {
    if (d.target === 'self') {
      const approved = checkedBrief(d.brief);
      const current = await briefFor(ctx, member.familyId, member._id);
      const values = { proposed: approved, approved, pendingRevision: undefined, status: 'accepted' as const, step: 'done' as const, helpRequested: false, updatedAt: now };
      if (current) await ctx.db.patch(current._id, values);
      else await ctx.db.insert('assistantBriefs', { familyId: member.familyId, memberId: member._id, creatorId: member._id, createdAt: now, ...values });
    } else await saveBrief(ctx, member, person, d.brief, now);
  }
  await ctx.db.patch(row._id, { status: 'created', resultMemberId: person._id, updatedAt: now });
  const review = row.reviewMessageId ? await ctx.db.get(row.reviewMessageId) : null;
  if (review?.body.type === 'block') await ctx.db.patch(review._id, { body: { ...review.body, answeredWith: { value: 'Confirmed' } } });
  await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: d.target === 'self' ? C.created : C.inviteReady }, now, { ruleBlock: 'creation' });
  if (d.target !== 'self') await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'block', block: { kind: 'invite', memberId: person._id } }, now);
  return person._id;
}

export async function answerCreation(ctx: MutationCtx, member: Doc<'members'>, message: Doc<'messages'>, answer: BlockAnswer, now: number): Promise<boolean> {
  if (message.ruleBlock !== 'creation' || message.body.type !== 'block' || message.body.block.kind !== 'megaDraft') return false;
  const block = message.body.block;
  if (answer.value === 'confirm') await confirmDraft(ctx, member, block.draftId, block.revision, now);
  else {
    const row = await ownedDraft(ctx, member, block.draftId);
    if (row.status !== 'review' || row.revision !== block.revision) return true;
    await ctx.db.patch(row._id, { status: answer.value === 'cancel' ? 'cancelled' : 'draft', reviewMessageId: undefined });
    await postOwnMegaMessage(ctx, member.familyId, member._id, { type: 'text', text: answer.value === 'cancel' ? 'Draft cancelled.' : C.changeHint }, now, { ruleBlock: 'creation' });
  }
  return true;
}

export async function cancelDraft(ctx: MutationCtx, member: Doc<'members'>, id: unknown, now: number) {
  const row = await ownedDraft(ctx, member, id);
  if (row.status === 'created') fail('VALIDATION', 'This MEGA has already been created.');
  await invalidateReview(ctx, row);
  await ctx.db.patch(row._id, { status: 'cancelled', updatedAt: now, reviewMessageId: undefined });
}
