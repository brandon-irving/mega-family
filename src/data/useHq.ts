// HQ (placeholder screen for G1): the shared room or a member's own room.
import { useQuery } from 'convex/react';
import type { Id } from '@shared/domain/validators';
import { api } from './api';

export function useHqRoom(ownerId?: Id<'members'>) {
  return useQuery(api.hq.room, { ownerId });
}
