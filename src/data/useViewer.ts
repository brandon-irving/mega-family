// The signed-in member, their family, MEGA and theme — everything the shell needs to render.
import { useQuery } from 'convex/react';
import { api } from './api';
import { useStableQuery } from './useStableQuery';

export function useViewer() {
  // No-flicker rule: a brief resubscribe (tab switch, reconnect) keeps showing the last viewer instead
  // of flashing every screen's "Opening…" loading state over content that was already there.
  return useStableQuery(useQuery(api.me.get, {}));
}
