import { useMutation } from 'convex/react';
import { api } from './api';
import { useQueryState } from './useQuery';
export function useMegaDraft() {
  const state = useQueryState(api.megaCreation.current, {});
  return state.status === 'ok' ? state.data : null;
}

export const usePersonalizeMega = () => useMutation(api.megaCreation.personalize);

export const useUpdateDraftAppearance = () => useMutation(api.megaCreation.updateAppearance);
export const useReviewMegaDraft = () => useMutation(api.megaCreation.review);
