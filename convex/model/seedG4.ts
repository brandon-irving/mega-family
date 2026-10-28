// G4 sample-family additions (docs/gates/G4.md backend task 8): soccer and school events linked to their saved
// places, one past search per kid (Twin 2's blocked), and a travel check for Thursday's soccer pickup.
//
// Nothing here is a made-up reading (invariant 7: fail closed, never made up): the seeded travel check is the
// honest `not_configured` result a deployment without MAPBOX_TOKEN gets, and there's no seeded forecast —
// `seed.resetDemo` asks the real Weather adapter for one instead.
import { SAMPLE_FAMILY as S, type SampleKey } from '../../shared/fixtures/sampleFamily';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const MINUTE = 60_000;

export async function seedG4(ctx: MutationCtx, p: { familyId: Id<'families'>; m: Record<SampleKey, Id<'members'>>; now: number }): Promise<void> {
  const { familyId, m, now } = p;
  const places = await ctx.db
    .query('places')
    .withIndex('by_family_kind', (q) => q.eq('familyId', familyId))
    .collect();
  const placeByKey = new Map(S.places.map((sp) => [sp.key, places.find((row) => row.label === sp.label && row.kind === sp.kind)]));

  const events = await ctx.db
    .query('events')
    .withIndex('by_family_start', (q) => q.eq('familyId', familyId))
    .collect();
  for (const e of events) {
    if (e.scope === 'personal') continue; // a private event's place is its owner's business
    const rule = S.g4.eventPlaces.find((r) => e.title.toLowerCase().includes(r.titleIncludes));
    const place = rule ? placeByKey.get(rule.place) : undefined;
    if (place) await ctx.db.patch(e._id, { placeId: place._id, place: e.place ?? place.label });
  }

  for (const s of S.g4.searches) {
    await ctx.db.insert('searchLog', {
      familyId,
      memberId: m[s.for],
      at: now - s.minutesAgo * MINUTE,
      query: s.query,
      outcome: s.outcome,
      category: s.category,
      decidedBy: s.decidedBy,
      sourceCount: s.sourceCount,
    });
  }

  const pickup = events.find((e) => e.title === 'Soccer pickup' && e.scope !== 'personal' && e.end !== undefined);
  const home = placeByKey.get('home');
  const field = placeByKey.get('field');
  if (pickup && home && field) {
    await ctx.db.insert('travelChecks', { familyId, eventId: pickup._id, fromPlaceId: home._id, toPlaceId: field._id, departAt: pickup.start, failure: 'not_configured', checkedAt: now });
  }
}
