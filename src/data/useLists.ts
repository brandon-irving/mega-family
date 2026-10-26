// Lists shared by the Today sheet and the Family tab.
import { useMutation, useQuery } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';

export function useLists() {
  return useQuery(api.lists.all, {});
}

export function useAddListItem() {
  return useMutation(api.lists.addItem);
}

export function useCheckListItem() {
  return useMutation(api.lists.check);
}

export function useRemoveListItem() {
  const remove = useMutation(api.lists.remove);
  return (itemId: Id<'listItems'>) => remove({ itemId });
}
