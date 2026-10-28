// G4 (CONTRACT v0.15): family places, weather, travel time and a kid's search log. Every read goes through
// `useQueryState`, so a stub (G4 backend still being built), a forbidden read or a provider failure renders a
// calm line on screen instead of throwing into the thread or the page.
import { useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';
import { useQueryState } from './useQuery';

/** Every family place (household data; any member reads them). */
export function usePlaces() {
  return useQueryState(api.places.list, {});
}

export function usePlaceActions() {
  return { upsert: useMutation(api.places.upsert), remove: useMutation(api.places.remove) };
}

/** The weather for one place (home when omitted). `null` when the family has no geocoded place yet. */
export function useWeather(placeId?: Id<'places'>) {
  return useQueryState(api.weather.get, placeId ? { placeId } : {});
}

/** Leave-by for one event, or `null` before a check has run. NOT_FOUND for a private event that isn't yours. */
export function useTravelForEvent(eventId: Id<'events'> | null) {
  return useQueryState(api.travel.forEvent, eventId ? { eventId } : 'skip');
}

/** How many search-log rows a parent's page loads (the log keeps only blocked/changed searches, so one page
 * covers weeks; "load more" isn't on the board). */
export const SEARCH_LOG_PAGE = 30;

/** A kid's blocked/changed searches, for one of their parents (FORBIDDEN when the kid's
 * `tellsParents.blockedSearches` is off, or for anyone else). */
export function useKidSearchLog(memberId: Id<'members'> | null) {
  return useQueryState(api.search.log, memberId ? { memberId, paginationOpts: { numItems: SEARCH_LOG_PAGE, cursor: null } } : 'skip');
}

/** Set or clear an event's saved place (`events.update` with `placeId`; v0.15). */
/** CONTRACT v0.15a: a travel card's On my way / Snooze 5 min / Remind me 30 min before. */
export function useTravelAnswer() {
  return useMutation(api.travel.answer);
}

export function useSetEventPlace() {
  return useMutation(api.events.update);
}
