// Family tab data: members, a member's detail sheet, their (read-only) kid thread, kid controls,
// coming-up events and the full calendar range.
import { useMutation, usePaginatedQuery } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';
import { useQuery } from './useQuery';
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
