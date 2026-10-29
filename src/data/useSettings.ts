// G5 Settings: the member's own look and notification settings (`settings.set`, CONTRACT §4) and, for the admin,
// the family's parent code (`family.parentCode`, admin only — skipped for everyone else, so it never errors).
import { useMutation } from 'convex/react';
import { api } from './api';
import { useQueryState } from './useQuery';

export function useSetSettings() {
  return useMutation(api.settings.set);
}

export function useParentCode(isAdmin: boolean) {
  const state = useQueryState(api.family.parentCode, isAdmin ? {} : 'skip');
  return state.status === 'ok' ? state.data.code : null;
}
