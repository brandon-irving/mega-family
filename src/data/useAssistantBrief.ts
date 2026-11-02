import { useMutation } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';
import { useQueryState } from './useQuery';

export function useAssistantBrief(memberId: Id<'members'>) {
  return useQueryState(api.assistantBriefs.forMember, { memberId });
}
export const useSaveAssistantBrief = () => useMutation(api.assistantBriefs.save);
