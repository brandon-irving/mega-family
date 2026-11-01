// Family tab data: members, a member's detail sheet, their (read-only) kid thread, kid controls,
// coming-up events and the full calendar range.
import { useMutation, usePaginatedQuery } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';
import type { KidRulesView } from '@shared/domain/api';
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

/** A kid's own rules, read-only (`kidControls.mine`): their control fields, buzzes a day and their parents'
 * names. undefined while loading or if the server can't answer (the rows that need it stay hidden), null for an
 * adult or a kid with no controls row. */
export function useMyRules(enabled: boolean): KidRulesView | null | undefined {
  const state = useQueryState(api.kidControls.mine, enabled ? {} : 'skip');
  return state.status === 'ok' ? state.data : undefined;
}

/** A kid's buzzes a day, for their parent's Rules stepper (`kidControls.dailyCap`); undefined until it answers,
 * so the page never shows a stepper it can't save. The range is LIMITS.push.kidDailyCapRange. */
export function useKidDailyCap(memberId: Id<'members'>) {
  const state = useQueryState(api.kidControls.dailyCap, { memberId });
  return state.status === 'ok' ? state.data.dailyCap : undefined;
}

export function useSetKidDailyCap() {
  return useMutation(api.kidControls.setDailyCap);
}

export function useNextFamilyEvent() { return useQuery(api.family.nextEvent, {}); }

export function useAddFamilyMember() { return useMutation(api.family.add); }
