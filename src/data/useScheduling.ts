import { useAction, useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';
import { useQueryState } from './useQuery';
export const useSchedulingPreferences = () => useQueryState(api.scheduling.preferences, {});
export const useMailPlan = (planId: Id<'mailPlans'>) => useQueryState(api.scheduling.get, { planId });
export const useMailPlans = () => useQueryState(api.scheduling.list, {});
export function useSchedulingActions() {
  return { syncCalendar: useAction(api.scheduling.syncCalendar), setPreferences: useMutation(api.scheduling.setPreferences), refresh: useAction(api.scheduling.refresh), hold: useAction(api.scheduling.hold), draft: useAction(api.scheduling.draft), dismiss: useMutation(api.scheduling.dismiss) };
}
