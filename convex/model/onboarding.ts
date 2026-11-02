import { recommendConnection } from './connectionRecommendations';
import { migrateCreation } from './megaCreation';
import { getOrCreateOwnThread } from './threads';
import { MEGA_CREATION } from '../../shared/config/megaCreation';
import { ASSISTANT_BRIEF } from '../../shared/config/assistantBrief';
import { briefFieldsBlock } from '../../shared/assistantBrief';
import { saveBrief } from './assistantBriefs';
// G5 (CONTRACT v0.17): the onboarding chat (owner, Oct 28; canvas Screen 13 + Screen 5's family boards).
// Server-driven and model-free: MEGA's lines are G5_COPY, the name is parsed by rule, every step is a row in
// `onboarding`. Steps: name → gmail → calendar → ics → family → done. Each offer step moves on after a connect
// or Not now (skipping never blocks); an offer already answered (e.g. Calendar granted together with Gmail) is
// skipped over. The family step is a small sub-machine of thread blocks answered through `chat.answerBlock`
// (`blockMessageId` marks the one waiting), which create real members via `family.add`'s logic.
import { ONBOARDING_STEPS, STICKERS } from '../../shared/config/ids';
import { ONBOARDING } from '../../shared/config/onboarding';
import { fillCopy, G5_COPY } from '../../shared/config/copy';
import { PERSONALITIES, type Relationship } from '../../shared/domain/enums';
import type { BlockAnswer, UIBlock } from '../../shared/domain/messages';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { fail } from './errors';
import { addFamilyMember, defaultInviteMega, familyIsFull, giveMega } from './familyAdd';
import { type ConnectOffer, onboardingRow } from './integrations';
import { postOwnMegaMessage } from './threads';

type Step = (typeof ONBOARDING_STEPS)[number];
type Row = Doc<'onboarding'>;
type Body = Doc<'messages'>['body'];

const OFFER_STEP: Record<ConnectOffer, Step> = { gmail: 'gmail', calendar: 'calendar', ics: 'ics' };
const STEP_OFFER: Partial<Record<Step, ConnectOffer>> = { gmail: 'gmail', calendar: 'calendar', ics: 'ics' };

const KID_RELATIONSHIPS: Relationship[] = ['daughter', 'son', 'child', 'other'];
const ADULT_RELATIONSHIPS: Relationship[] = ['partner', 'parent', 'sibling', 'grandparent', 'other'];

/** "Call me Sam" → "Sam". Trimmed, a leading phrase stripped (ONBOARDING.namePrefixes, longest first), trailing
 * punctuation dropped, first letter capitalized. null when nothing usable is left or it's too long. */
export function parseName(raw: string): string | null {
  let s = raw.trim().replace(/\s+/g, ' ');
  const lower = () => s.toLowerCase();
  for (const p of [...ONBOARDING.namePrefixes].sort((a, b) => b.length - a.length)) {
    if (lower().startsWith(`${p} `)) {
      s = s.slice(p.length).trim();
      break;
    }
  }
  s = s.replace(/[.!?,;:]+$/g, '').trim();
  if (!s || s.length > ONBOARDING.nameMaxLength || /[\u0000-\u001f<>{}]/.test(s)) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Only obvious short name replies use the no-model shortcut. Sentences stay conversational. */
export function parseNameReply(raw: string): string | null {
  const name = parseName(raw);
  if (!name || /[?!]/.test(raw.trim().replace(/!$/, '')) || !/^[\p{L}\p{M} .’'\-]+$/u.test(name)) return null;
  const words = name.toLowerCase().split(/\s+/);
  if (words.length > ONBOARDING.nameReplyMaxWords || words.some(word => (ONBOARDING.nameReplyNonNames as readonly string[]).includes(word))) return null;
  return name;
}

async function ownMega(ctx: MutationCtx, familyId: Id<'families'>, memberId: Id<'members'>): Promise<Doc<'megas'> | null> {
  return ctx.db
    .query('megas')
    .withIndex('by_family_owner', (q) => q.eq('familyId', familyId).eq('ownerId', memberId))
    .unique();
}

/** Posts one message from the member's own MEGA in their own thread. */
function say(ctx: MutationCtx, row: Row, body: Body, now: number): Promise<Id<'messages'> | null> {
  return postOwnMegaMessage(ctx, row.familyId, row.memberId, body, now);
}

const text = (t: string): Body => ({ type: 'text', text: t });
const block = (b: UIBlock): Body => ({ type: 'block', block: b });
const choice = (prompt: string, options: { id: string; label: string }[]): UIBlock => ({ kind: 'choice', prompt, options, multi: false, allowOther: false });

/** Posts a block (answered by rule, never by an agent turn: v0.17b C3) and remembers it as the one waiting. */
async function ask(ctx: MutationCtx, row: Row, b: UIBlock, family: Row['family'], now: number): Promise<void> {
  const blockMessageId = await postOwnMegaMessage(ctx, row.familyId, row.memberId, block(b), now, { ruleBlock: 'onboarding' });
  await ctx.db.patch(row._id, { family, blockMessageId: blockMessageId ?? undefined });
}

const whoChoice = () =>
  choice(G5_COPY.familyAsk, [
    { id: 'kid', label: G5_COPY.familyKid },
    { id: 'other', label: G5_COPY.familyOther },
    { id: 'justMe', label: G5_COPY.familyJustMe },
  ]);

const nameBlock = (): UIBlock => ({ kind: 'text', prompt: G5_COPY.personName, placeholder: G5_COPY.personNamePlaceholder });

const getsMegaChoice = (name: string) =>
  choice(fillCopy(G5_COPY.personGetsMega, { name }), [
    { id: 'yes', label: G5_COPY.personGetsMegaYes },
    { id: 'no', label: G5_COPY.personGetsMegaNo },
  ]);

function detailsBlock(role: 'adult' | 'kid'): UIBlock {
  return {
    kind: 'fields',
    prompt: G5_COPY.personDetails,
    fields: [
      { id: 'birthday', label: G5_COPY.personDetailsBirthday, type: 'date' },
      { id: 'grade', label: role !== 'kid' ? G5_COPY.personDetailsWork : G5_COPY.personDetailsGrade, type: 'text' },
      { id: 'activities', label: G5_COPY.personDetailsActivities, type: 'text' },
    ],
    skippable: true,
  };
}

/** v0.17b (C12): the family is at ONBOARDING.maxFamilyMembers — say so and offer the only way on. */
const fullChoice = () => choice(fillCopy(G5_COPY.familyFull, { max: ONBOARDING.maxFamilyMembers }), [{ id: 'done', label: G5_COPY.familyDoneForNow }]);

/** v0.17b (C2): the block the family sub-step is waiting on, rebuilt from the row (when the posted one is gone). */
async function familyBlockFor(ctx: MutationCtx, row: Row): Promise<UIBlock> {
  const f = row.family!;
  const person = row.personId ? await ctx.db.get(row.personId) : null;
  switch (f.step) {
    case 'who':
      return whoChoice();
    case 'more':
      return (await familyIsFull(ctx, row.familyId)) ? fullChoice() : moreChoice();
    case 'name':
      return nameBlock();
    case 'relationship':
      return relationshipChoice(f.name ?? '', f.role ?? 'kid');
    case 'getsMega':
      return getsMegaChoice(f.name ?? person?.name ?? '');
    case 'details':
      return detailsBlock(person?.role === 'kid' || f.role === 'kid' ? 'kid' : 'adult');
    case 'brief':
      return briefFieldsBlock(fillCopy(ASSISTANT_BRIEF.creatorPrompt, { name: person?.name ?? '' }));
    case 'look':
      return person ? lookBlock(ctx, person) : whoChoice();
  }
}

/** Posts what the current step shows: the greeting and the name question, a connect card, or the family ask. */
export async function postStep(ctx: MutationCtx, row: Row, now: number): Promise<void> {
  switch (row.step) {
    case 'name': {
      const mega = await ownMega(ctx, row.familyId, row.memberId);
      await say(ctx, row, text(fillCopy(G5_COPY.hello, { mega: mega?.name ?? '' })), now);
      await say(ctx, row, text(G5_COPY.askName), now);
      return;
    }
    case 'gmail':
    case 'calendar':
    case 'ics':
      await say(ctx, row, { type: 'card', card: { kind: 'connect', offer: STEP_OFFER[row.step]! } }, now);
      return;
    case 'family': {
      if (row.family) {
        await ask(ctx, row, await familyBlockFor(ctx, row), row.family, now);
        return;
      }
      const member = await ctx.db.get(row.memberId);
      if (!member) return;
      const mega = await ownMega(ctx, row.familyId, row.memberId);
      const thread = await getOrCreateOwnThread(ctx, row.familyId, row.memberId, mega?._id ?? null, now);
      await migrateCreation(ctx, member, thread._id, now);
      await say(ctx, row, text(MEGA_CREATION.start), now);
      return;
    }
    case 'done':
      return;
  }
}

/** True when the thread already shows the current step's prompt (so `chat.start` doesn't post it twice). */
export async function stepIsShowing(ctx: MutationCtx, row: Row, threadId: Id<'threads'>): Promise<boolean> {
  const recent = await ctx.db
    .query('messages')
    .withIndex('by_family_thread_at', (q) => q.eq('familyId', row.familyId).eq('threadId', threadId))
    .order('desc')
    .take(20);
  const offer = STEP_OFFER[row.step];
  if (offer) return recent.some((m) => m.body.type === 'card' && m.body.card.kind === 'connect' && m.body.card.offer === offer);
  if (row.step === 'name') return recent.some((m) => m.body.type === 'text' && m.body.text === G5_COPY.askName);
  // v0.17b (C2): the family block counts as showing while it exists unanswered, however far back it is.
  if (row.step === 'family') {
    const waiting = row.blockMessageId ? await ctx.db.get(row.blockMessageId) : null;
    return !!waiting && waiting.body.type === 'block' && waiting.body.answeredWith === undefined;
  }
  return true;
}

/** The next step after the current one, skipping offers that already have an answer. */
function nextStep(row: Row): Step {
  const order = ONBOARDING_STEPS as readonly Step[];
  for (let i = order.indexOf(row.step) + 1; i < order.length; i++) {
    const offer = STEP_OFFER[order[i]];
    if (offer && row.outcomes[offer]) continue;
    return order[i];
  }
  return 'done';
}

async function moveTo(ctx: MutationCtx, row: Row, step: Step, now: number): Promise<void> {
  await ctx.db.patch(row._id, { step, ...(step === 'done' ? { finishedAt: now, blockMessageId: undefined, family: undefined } : {}) });
  await postStep(ctx, (await ctx.db.get(row._id))!, now);
}

export async function advance(ctx: MutationCtx, row: Row, now: number): Promise<void> {
  await moveTo(ctx, row, nextStep(row), now);
}

/** An offer was answered (connected or Not now). Records it once; during onboarding, when it's the current
 * step, the chat moves on. `advanceNow: false` (Gmail) waits for the first look at the inbox to finish. */
export async function completeOffer(
  ctx: MutationCtx,
  p: { familyId: Id<'families'>; memberId: Id<'members'>; offer: ConnectOffer; outcome: 'connected' | 'skipped'; now: number; advanceNow?: boolean },
): Promise<void> {
  const row = await onboardingRow(ctx, p.familyId, p.memberId);
  if (!row) {
    if (p.outcome === 'skipped') await ctx.db.insert('onboarding', { familyId: p.familyId, memberId: p.memberId, step: 'done', outcomes: { [p.offer]: 'skipped' }, startedAt: p.now, finishedAt: p.now });
    return;
  }
  const outcomes = { ...row.outcomes, [p.offer]: p.outcome === 'connected' ? 'connected' : (row.outcomes[p.offer] ?? 'skipped') };
  await ctx.db.patch(row._id, { outcomes, failures: { ...(row.failures ?? {}), [p.offer]: undefined } });
  if (row.step === OFFER_STEP[p.offer] && p.advanceNow !== false) await advance(ctx, (await ctx.db.get(row._id))!, p.now);
}

/** Gmail's first look finished (found something or not, or failed): onboarding moves past the Gmail step. */
export async function gmailFirstLookDone(ctx: MutationCtx, familyId: Id<'families'>, memberId: Id<'members'>, now: number): Promise<void> {
  const row = await onboardingRow(ctx, familyId, memberId);
  if (row?.step === 'gmail') await advance(ctx, row, now);
}

/** `onboarding.setName` and `chat.send` while the step is `name`. */
export async function setName(ctx: MutationCtx, member: Doc<'members'>, raw: string, now: number): Promise<string> {
  const row = await onboardingRow(ctx, member.familyId, member._id);
  if (!row || row.step !== 'name') fail('VALIDATION', 'not asking for a name');
  const name = parseName(raw);
  if (!name) fail('VALIDATION', fillCopy(G5_COPY.nameAgain, { max: ONBOARDING.nameMaxLength }));
  await ctx.db.patch(member._id, { name });
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_family_member', (q) => q.eq('familyId', member.familyId).eq('memberId', member._id))
    .unique();
  if (profile) await ctx.db.patch(profile._id, { callMe: name });
  const family = await ctx.db.get(member.familyId);
  if (family && member.role === 'admin' && family.adminId === member._id) await ctx.db.patch(family._id, { name: fillCopy(ONBOARDING.familyNameTemplate, { name }) });
  return name;
}

/** After the name: "Nice to meet you" is the reply the caller posts (it's the streamed reply in `chat.send`);
 * this opens ordinary conversation instead of an automatic connection or creation sequence. */
export async function afterName(ctx: MutationCtx, member: Doc<'members'>, now: number, askAboutOwner = true): Promise<void> {
  const row = await onboardingRow(ctx, member.familyId, member._id);
  if (row) {
    await ctx.db.patch(row._id, { step: 'done', finishedAt: now });
    if (askAboutOwner) await say(ctx, row, text(G5_COPY.meetAdmin), now);
    await recommendConnection(ctx, member, '', now + 1, { allowBaseline: true });
  }
}

// ---------- the family step (Screen 5 boards, answered with chat.answerBlock) ----------

function relationshipChoice(name: string, role: 'adult' | 'kid'): UIBlock {
  const rels = role === 'kid' ? KID_RELATIONSHIPS : ADULT_RELATIONSHIPS;
  return choice(fillCopy(G5_COPY.personRelationship, { name }), rels.map((r) => ({ id: r, label: G5_COPY.relationshipLabels[r] })));
}

const moreChoice = () =>
  choice(G5_COPY.familyAsk, [
    { id: 'more', label: G5_COPY.personDone },
    { id: 'done', label: G5_COPY.personAllDone },
  ]);

function pickedOption(answer: BlockAnswer): string | undefined {
  return answer.optionIds?.[0];
}

async function finishFamily(ctx: MutationCtx, row: Row, line: string, now: number): Promise<void> {
  await say(ctx, row, text(line), now);
  await ctx.db.patch(row._id, { step: 'done', finishedAt: now, blockMessageId: undefined, family: undefined });
}

async function inviteAndMore(ctx: MutationCtx, row: Row, person: Doc<'members'>, now: number): Promise<void> {
  const mega = await ownMega(ctx, row.familyId, person._id);
  if (mega) {
    await say(ctx, row, text(fillCopy(G5_COPY.personInvite, { mega: mega.name, name: person.name })), now);
    await say(ctx, row, block({ kind: 'invite', memberId: person._id }), now);
  } else {
    await say(ctx, row, text(fillCopy(G5_COPY.personNoMega, { name: person.name })), now);
  }
  await ask(ctx, row, moreChoice(), { step: 'more' }, now);
}

async function lookBlock(ctx: MutationCtx, person: Doc<'members'>): Promise<UIBlock> {
  const start = await defaultInviteMega(ctx, person);
  const prompt = fillCopy(person.role === 'kid' ? G5_COPY.personLookKid : G5_COPY.personLook, { name: person.name });
  return { kind: 'look', prompt, forMemberId: person._id, value: { hex: start.look.hex, sticker: start.look.sticker, personality: start.personality, name: start.name } };
}

async function askLook(ctx: MutationCtx, row: Row, person: Doc<'members'>, now: number): Promise<void> {
  await ask(ctx, row, await lookBlock(ctx, person), { ...row.family!, step: 'look' }, now);
}

/** Routes an answer to the onboarding block waiting for one. Returns false when `message` isn't it (the caller
 * then runs the normal agent reply). VALIDATION on an answer that doesn't fit (the block stays open). */
export async function answerFamilyBlock(ctx: MutationCtx, admin: Doc<'members'>, message: Doc<'messages'>, answer: BlockAnswer, now: number): Promise<boolean> {
  const row = await onboardingRow(ctx, admin.familyId, admin._id);
  if (!row || row.step !== 'family' || !row.blockMessageId || row.blockMessageId !== message._id || !row.family) return false;
  const f = row.family;
  const picked = pickedOption(answer);
  switch (f.step) {
    case 'who':
    case 'more': {
      if (picked === 'justMe' || picked === 'done') {
        await finishFamily(ctx, row, picked === 'justMe' ? G5_COPY.familyLater : G5_COPY.familyAllSet, now);
        return true;
      }
      if (f.step === 'more' && picked === 'more') {
        await ask(ctx, row, whoChoice(), { step: 'who' }, now);
        return true;
      }
      if (picked !== 'kid' && picked !== 'other') fail('VALIDATION', 'pick one');
      // v0.17b (C12): a full family can't take another person; offer "Done for now" instead of a dead end.
      if (await familyIsFull(ctx, row.familyId)) {
        await ask(ctx, row, fullChoice(), { step: 'more' }, now);
        return true;
      }
      await ask(ctx, row, nameBlock(), { step: 'name', role: picked === 'kid' ? 'kid' : 'adult' }, now);
      return true;
    }
    case 'name': {
      const name = typeof answer.value === 'string' ? answer.value.trim() : '';
      if (!name || name.length > ONBOARDING.nameMaxLength) fail('VALIDATION', 'name');
      await ask(ctx, row, relationshipChoice(name, f.role ?? 'kid'), { ...f, step: 'relationship', name }, now);
      return true;
    }
    case 'relationship': {
      const allowed = f.role === 'kid' ? KID_RELATIONSHIPS : ADULT_RELATIONSHIPS;
      if (!picked || !(allowed as string[]).includes(picked)) fail('VALIDATION', 'pick one');
      const relationship = picked as Relationship;
      if (await familyIsFull(ctx, row.familyId)) {
        await ask(ctx, row, fullChoice(), { step: 'more' }, now);
        return true;
      }
      const personId = await addFamilyMember(ctx, admin, { name: f.name!, role: f.role ?? 'kid', relationship }, now);
      await ctx.db.patch(row._id, { personId });
      await ask(ctx, { ...row, personId }, getsMegaChoice(f.name!), { ...f, step: 'getsMega', relationship }, now);
      return true;
    }
    case 'getsMega': {
      const person = row.personId ? await ctx.db.get(row.personId) : null;
      if (!person) fail('NOT_FOUND');
      if (picked === 'no') {
        await inviteAndMore(ctx, row, person, now);
        return true;
      }
      if (picked !== 'yes') fail('VALIDATION', 'pick one');
      await ask(ctx, row, detailsBlock(person.role === 'kid' ? 'kid' : 'adult'), { ...f, step: 'details' }, now);
      return true;
    }
    case 'details': {
      const person = row.personId ? await ctx.db.get(row.personId) : null;
      if (!person) fail('NOT_FOUND');
      if (!answer.skipped && answer.fields) {
        const birthday = answer.fields.birthday?.trim();
        const grade = answer.fields.grade?.trim().slice(0, 40);
        const activities = (answer.fields.activities ?? '')
          .split(',')
          .map((a) => a.trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 8);
        await ctx.db.patch(person._id, {
          ...(birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? { birthday } : {}),
          ...(grade ? { grade } : {}),
          ...(activities.length ? { activities } : {}),
        });
      }
      await ask(ctx, row, briefFieldsBlock(fillCopy(ASSISTANT_BRIEF.creatorPrompt, { name: person.name })), { ...f, step: 'brief' }, now);
      return true;
    }
    case 'brief': {
      const person = row.personId ? await ctx.db.get(row.personId) : null;
      if (!person) fail('NOT_FOUND');
      if (!answer.skipped) await saveBrief(ctx, admin, person, answer.fields ?? {}, now);
      await askLook(ctx, row, person, now);
      return true;
    }
    case 'look': {
      const person = row.personId ? await ctx.db.get(row.personId) : null;
      if (!person) fail('NOT_FOUND');
      const fields = answer.fields ?? {};
      const sticker = fields.sticker as (typeof STICKERS)[number];
      const personality = fields.personality as (typeof PERSONALITIES)[number];
      if (!(STICKERS as readonly string[]).includes(sticker) || !(PERSONALITIES as readonly string[]).includes(personality)) fail('VALIDATION', 'look');
      await giveMega(ctx, person, { name: fields.name ?? '', look: { hex: fields.hex ?? '', sticker }, personality }, now);
      await inviteAndMore(ctx, row, (await ctx.db.get(person._id))!, now);
      return true;
    }
  }
}
