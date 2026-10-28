// Family places (G4, CONTRACT v0.15): household data. Every member reads them; adults (PLACES.editors) add,
// edit and remove. Coordinates come from the Geocoder port in the background (`places.geocode`), never from the
// phone. Shared by `convex/places.ts`, the events write path (placeId), the agent's place-label lookups and the
// weather/travel code.
import { PLACES } from '../../shared/config/integrations';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from './errors';

type Ctx = QueryCtx | MutationCtx;
const KIND_ORDER = { home: 0, school: 1, work: 2, other: 3 } as const;

export async function familyPlaces(ctx: Ctx, familyId: Id<'families'>): Promise<Doc<'places'>[]> {
  const rows = await ctx.db
    .query('places')
    .withIndex('by_family_kind', (q) => q.eq('familyId', familyId))
    .collect();
  return rows.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.label.localeCompare(b.label));
}

export function isGeocoded(place: Pick<Doc<'places'>, 'lat' | 'lng'>): place is Doc<'places'> & { lat: number; lng: number } {
  return typeof place.lat === 'number' && typeof place.lng === 'number';
}

export async function homePlace(ctx: Ctx, familyId: Id<'families'>): Promise<Doc<'places'> | null> {
  return ctx.db
    .query('places')
    .withIndex('by_family_kind', (q) => q.eq('familyId', familyId).eq('kind', 'home'))
    .first();
}

/** A place of this family by id, or NOT_FOUND (another family's place is indistinguishable from a missing one). */
export async function requireFamilyPlace(ctx: Ctx, familyId: Id<'families'>, placeId: Id<'places'>): Promise<Doc<'places'>> {
  const place = await ctx.db.get(placeId);
  if (!place || place.familyId !== familyId) fail('NOT_FOUND', 'place not found');
  return place;
}

/** The agent's place lookup: a label ("Soccer field"), a kind word ("home", "school") or an address substring,
 * case-insensitive. `null` when nothing matches — the tool then says INTEGRATION_COPY.noPlace. */
export async function placeByLabel(ctx: Ctx, familyId: Id<'families'>, raw: string): Promise<Doc<'places'> | null> {
  const want = raw.trim().toLowerCase();
  if (!want) return null;
  const places = await familyPlaces(ctx, familyId);
  return (
    places.find((p) => p.label.toLowerCase() === want) ??
    places.find((p) => p.kind === want) ??
    places.find((p) => p.label.toLowerCase().includes(want) || want.includes(p.label.toLowerCase())) ??
    places.find((p) => p.address.toLowerCase().includes(want)) ??
    null
  );
}

export function validatePlaceFields(label: string, address: string): { label: string; address: string } {
  const l = label.trim();
  const a = address.trim();
  if (!l || l.length > PLACES.maxLabelLength) fail('VALIDATION', `a place's name must be 1–${PLACES.maxLabelLength} characters`);
  if (!a || a.length > PLACES.maxAddressLength) fail('VALIDATION', `an address must be 1–${PLACES.maxAddressLength} characters`);
  return { label: l, address: a };
}
