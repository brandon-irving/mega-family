// G4b sample-family additions (CONTRACT v0.16, docs/gates/G4b.md): a price watch on the first seeded gift idea,
// a past holiday decision, and this year's cached public holidays (real dates), so every G4b function has a row
// to read. The watched product is a clearly labeled sample ref; `seed.resetDemo` in real mode replaces it with
// live catalog results (fail closed, never made up).
import { HOLIDAYS } from '../../shared/config/shopping';
import { SAMPLE_FAMILY as S, type SampleKey } from '../../shared/fixtures/sampleFamily';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const DAY = 86_400_000;

export async function seedG4b(ctx: MutationCtx, p: { familyId: Id<'families'>; m: Record<SampleKey, Id<'members'>>; now: number }): Promise<void> {
  const { familyId, m, now } = p;
  const g = S.g4b;

  const ideas = await ctx.db
    .query('giftIdeas')
    .withIndex('by_family_for', (q) => q.eq('familyId', familyId).eq('forMemberId', m[S.gd.gifts.for]))
    .first();
  if (ideas) {
    await ctx.db.patch(ideas._id, {
      ideas: ideas.ideas.map((idea, i) => (i === g.watch.ideaIndex ? { ...idea, productRefs: [g.watch.ref] } : idea)),
      addedToList: [...new Set([...ideas.addedToList, g.watch.ideaIndex])],
    });
    await ctx.db.insert('priceWatches', {
      familyId,
      giftIdeasId: ideas._id,
      ideaIndex: g.watch.ideaIndex,
      forMemberId: ideas.forMemberId,
      ref: g.watch.ref,
      title: g.watch.title,
      store: g.watch.store,
      url: g.watch.url,
      currency: 'USD',
      baselinePriceCents: g.watch.baselinePriceCents,
      status: 'watching',
      createdBy: m.admin,
      createdAt: now,
    });
  }

  const kids = S.members.filter((x) => x.role === 'kid' && x.login).map((x) => m[x.key]);
  await ctx.db.insert('routineSkips', {
    familyId,
    date: g.pastSkip.date,
    holidayName: g.pastSkip.holidayName,
    memberIds: kids,
    status: g.pastSkip.status,
    askedAt: now - 60 * DAY,
    answeredBy: m[g.pastSkip.by],
    answeredAt: now - 60 * DAY,
  });

  await ctx.db.insert('holidays', {
    familyId,
    country: HOLIDAYS.defaultCountry,
    year: 2026,
    list: g.holidays.map((h) => ({ ...h, types: [...h.types] })),
    fetchedAt: now,
    expiresAt: now + HOLIDAYS.refreshDays * DAY,
  });
}
