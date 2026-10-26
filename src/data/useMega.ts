// MEGA profile sheet data: the member's own MEGA, updating its look/personality/name, what it
// shares, and (admin) its remembered memories.
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import type { Scope } from '@shared/domain/enums';
import { api } from './api';

export function useMyMega() {
  return useQuery(api.megas.mine, {});
}

export function useMegaStatus(megaId: Id<'megas'> | null) {
  return useQuery(api.megas.status, megaId ? { megaId } : 'skip');
}

export function useUpdateMega() {
  return useMutation(api.megas.update);
}

/** What the MEGA shares (CONTRACT §4 `sharing.get`): the viewer's own `sharing` row, or `null` for a
 * kid (who has none) — the MEGA profile screen hides the "What it shares" section when this is null. */
export function useSharing() {
  return useQuery(api.sharing.get, {});
}

export function useSetSharing() {
  return useMutation(api.sharing.set);
}

export function useMemories(search: string | undefined, scope?: Scope) {
  return usePaginatedQuery(api.memories.list, { search, scope }, { initialNumItems: 20 });
}

export function useForgetMemory() {
  return useMutation(api.memories.forget);
}

export function useChangeMemoryScope() {
  return useMutation(api.memories.changeScope);
}
