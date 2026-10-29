// Family tab data: members, a member's detail sheet, their (read-only) kid thread, kid controls,
// coming-up events and the full calendar range.
import { useMutation, usePaginatedQuery } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';
import { kidControlsMine, type MyRules } from './pendingContract';
import { useQuery, useQueryState } from './useQuery';
import { useStablePaginatedQuery } from './useStableQuery';

export function useFamilyMembers() {
  return useQuery(api.family.members, {});
}

export function useMemberDetail(memberId: Id<'members'> | null) {
  return useQuery(api.family.member, memberId ? { memberId } : 'skip');
}

export function useKidThread(memberId: Id<'members'> | null) {
  return useStablePaginatedQuery(usePaginatedQuery(api.family.kidThread, memberId ? { memberId } : 'skip', { initialNumItems: 30 }));
}

export function useComingUp() {
  return useQuery(api.family.comingUp, {});
}

export function useCalendarRange(from: number | null, to: number | null) {
  return useQuery(api.calendar.range, from !== null && to !== null ? { from, to } : 'skip');
}

export function useSetKidControls() {
  return useMutation(api.kidControls.set);
}

/** A kid's own rules, read-only (`kidControls.mine`, CONTRACT v0.17b pending): undefined while loading or when
 * the backend can't answer yet (the rows that need it stay hidden), null for a kid with no controls row. */
export function useMyRules(enabled: boolean): MyRules | null | undefined {
  const state = useQueryState(kidControlsMine, enabled ? {} : 'skip');
  return state.status === 'ok' ? state.data : undefined;
}
