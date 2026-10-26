// The signed-in member, their family, MEGA and theme — everything the shell needs to render.
import { api } from './api';
import { useQuery } from './useQuery';

export function useViewer() {
  // No-flicker rule (useQuery wrapper): a brief resubscribe (tab switch, reconnect) keeps showing the
  // last viewer instead of flashing every screen's "Opening…" loading state over content that was already
  // there.
  return useQuery(api.me.get, {});
}
