import { useMutation, usePaginatedQuery } from 'convex/react';
import { IDEAS } from '@shared/config/ideas';
import type { IdeaCategory, IdeaSort } from '@shared/domain/ideas';
import { api } from './api';

export function useIdeas(args: { sort?: IdeaSort; category?: IdeaCategory; saved?: boolean; search?: string }) {
  return usePaginatedQuery(api.ideas.list, args, { initialNumItems: IDEAS.pageSize });
}
export function useSaveMessageIdea() { return useMutation(api.ideas.saveMessage); }
export function useSetIdeaSaved() { return useMutation(api.ideas.setSaved); }
export function useDismissIdea() { return useMutation(api.ideas.dismiss); }
export function useCategorizeIdea() { return useMutation(api.ideas.categorize); }
export function useRefreshGiftIdeas() { return useMutation(api.ideas.refreshGifts); }
