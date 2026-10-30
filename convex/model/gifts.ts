// GD (CONTRACT v0.13): birthday gift ideas (invariant 7). Built ONLY from household-shared facts — memories
// in GIFTS.sourceScopes (family/adults, read by their scopeKey, never a private or grant one; never a
// sensitive one) plus the member's own listed activities — and never shown to the person they're for or to
// kids. Each idea cites the facts it's based on.
import { GD_PUSH_COPY, fillCopy } from '../../shared/config/copy';
import { GIFTS } from '../../shared/config/calendar';
import { giftsDedupeKey } from '../../shared/config/proactive';
import type { Scope } from '../../shared/domain/enums';
import { addDays, localDate } from '../../shared/time';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';
import { indexGiftIdeas } from './ideas';
import { enqueueCardCandidate } from './proactive';
import { scopeKey } from './scopes';

type Ctx = QueryCtx | MutationCtx;

export type GiftFact = Doc<'giftIdeas'>['basedOn'][number];

/** May this viewer see gift ideas for `forMemberId`? Adults only, and never the birthday person. */
export function canSeeGiftsFor(viewer: Doc<'members'>, forMemberId: Id<'members'>): boolean {
  return (GIFTS.viewers as readonly string[]).includes(viewer.role) && viewer._id !== forMemberId;
}

export function requireGiftViewer(viewer: Doc<'members'>, forMemberId: Id<'members'>): void {
  if (!(GIFTS.viewers as readonly string[]).includes(viewer.role)) fail('FORBIDDEN', 'gift ideas are for grown-ups');
  if (viewer._id === forMemberId) fail('FORBIDDEN', 'no peeking at your own presents');
}

/** The next occurrence (on or after `today`) of a "YYYY-MM-DD" birthday, as "YYYY-MM-DD", and days away. */
export function nextBirthday(birthday: string, today: string): { date: string; daysAway: number } {
  const [, mm, dd] = birthday.split('-');
  const year = Number(today.slice(0, 4));
  let date = `${year}-${mm}-${dd}`;
  if (date < today) date = `${year + 1}-${mm}-${dd}`;
  let daysAway = 0;
  while (addDays(today, daysAway) < date) daysAway++;
  return { date, daysAway };
}

/** "Twin 1 shared: loves dinosaurs" (a fact about them) or "Shared: Gift budget is about $40" (about gifts). */
export function giftFactLabel(name: string, text: string, aboutThem: boolean): string {
  const t = text.trim().replace(/\.$/, '');
  return aboutThem ? `${name} shared: ${t.charAt(0).toLowerCase()}${t.slice(1)}` : `Shared: ${t}`;
}

/** The household-shared facts about `forMember` (or about gifts) that ideas may cite. Never reads a
 * personal or grant memory: it only queries the family/adults scopeKeys. */
export async function sharedFactsFor(ctx: Ctx, forMember: Doc<'members'>): Promise<{ text: string; fact: GiftFact }[]> {
  const out: { text: string; fact: GiftFact }[] = [];
  for (const scope of GIFTS.sourceScopes as readonly Scope[]) {
    if (scope !== 'family' && scope !== 'adults') continue; // structural: only household scopes have a shared key
    const rows = await ctx.db
      .query('memories')
      .withIndex('by_family_scopeKey', (q) => q.eq('familyId', forMember.familyId).eq('scopeKey', scopeKey(forMember.familyId, { scope })))
      .collect();
    for (const m of rows) {
      if (m.sensitive || m.validUntil !== undefined) continue;
      const aboutThem = m.about.includes(forMember._id);
      if (!aboutThem && !/\bgift/i.test(m.text)) continue;
      out.push({ text: m.text.trim(), fact: { label: giftFactLabel(forMember.name, m.text, aboutThem), source: { kind: 'memory', memoryId: m._id } } });
    }
  }
  for (const activity of forMember.activities) {
    out.push({ text: `${forMember.name} does ${activity}`, fact: { label: `${forMember.name} plays ${activity.toLowerCase()}`, source: { kind: 'member', field: 'activities' } } });
  }
  return out;
}

/** Queues a gift-idea set (status 'queued') and schedules the model step. */
export async function queueGiftIdeas(ctx: MutationCtx, params: { forMember: Doc<'members'>; date: string; createdBy?: Id<'members'>; now: number }): Promise<Id<'giftIdeas'>> {
  const giftIdeasId = await ctx.db.insert('giftIdeas', {
    familyId: params.forMember.familyId,
    forMemberId: params.forMember._id,
    occasion: 'birthday',
    date: params.date,
    basedOn: [],
    ideas: [],
    status: 'queued',
    createdBy: params.createdBy,
    createdAt: params.now,
    addedToList: [],
  });
  await ctx.scheduler.runAfter(0, internal.gifts.draft, { giftIdeasId });
  return giftIdeasId;
}

/** Sweep: a birthday within GIFTS.lookaheadDays with no idea set yet gets one, offered by Hub on its own. */
export async function scanGiftTriggers(ctx: MutationCtx, familyId: Id<'families'>, tz: string, now: number): Promise<void> {
  const today = localDate(now, tz);
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', familyId))
    .collect();
  for (const m of members) {
    if (!m.birthday) continue;
    const { date, daysAway } = nextBirthday(m.birthday, today);
    if (daysAway > GIFTS.lookaheadDays) continue;
    const existing = await ctx.db
      .query('giftIdeas')
      .withIndex('by_family_for', (q) => q.eq('familyId', familyId).eq('forMemberId', m._id))
      .collect();
    if (existing.some((g) => g.date === date)) continue;
    await queueGiftIdeas(ctx, { forMember: m, date, now });
  }
}

/** Sends each adult (never the birthday person) a gifts card once a set is ready. */
export async function deliverGiftCards(ctx: MutationCtx, set: Doc<'giftIdeas'>, now: number): Promise<void> {
  const forMember = await ctx.db.get(set.forMemberId);
  const family = await ctx.db.get(set.familyId);
  if (!forMember || !family) return;
  const members = await ctx.db
    .query('members')
    .withIndex('by_family', (q) => q.eq('familyId', set.familyId))
    .collect();
  const { daysAway } = nextBirthday(set.date, localDate(now, family.timezone));
  const when = daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`;
  for (const adult of members.filter((m) => canSeeGiftsFor(m, set.forMemberId) && !!m.authId)) {
    await indexGiftIdeas(ctx, set, adult);
    await enqueueCardCandidate(ctx, {
      familyId: set.familyId,
      recipientId: adult._id,
      kind: 'update',
      dedupeKey: giftsDedupeKey(set._id, adult._id),
      title: fillCopy(GD_PUSH_COPY.gifts.title, { name: forMember.name }),
      text: fillCopy(GD_PUSH_COPY.gifts.text, { name: forMember.name, when }),
      source: { kind: 'gifts', giftIdeasId: set._id },
      now,
    });
  }
}
