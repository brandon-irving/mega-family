// GD Screen 11 (CONTRACT v0.13): the Store. `store.catalog` is kids-only (adults get FORBIDDEN), so it goes
// through `useQueryState` and the screen shows a calm line instead of crashing for an adult or a stub.
import { useMutation } from 'convex/react';
import { api } from './api';
import { useQueryState } from './useQuery';

export function useStoreCatalog() {
  return useQueryState(api.store.catalog, {});
}

export function useBuy() {
  return useMutation(api.store.buy);
}

/** Wearing a bought look part (antenna, eyes, eye color, sticker, color) is a normal MEGA look update. */
export function useUpdateMyMega() {
  return useMutation(api.megas.update);
}

/** Placing bought furniture is a normal room update (CONTRACT §4 `rooms.update`). */
export function useUpdateRoom() {
  return useMutation(api.rooms.update);
}
