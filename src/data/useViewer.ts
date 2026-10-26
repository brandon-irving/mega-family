// The signed-in member, their family, MEGA and theme — everything the shell needs to render.
import { useQuery } from 'convex/react';
import { api } from './api';

export function useViewer() {
  return useQuery(api.me.get, {});
}
