// Resolves a set of notification ids to their full docs in one batch, via `notifications.get`
// (CONTRACT §4 v0.6, pending approval) — used by the chat thread to render a `{ kind: 'notification' }`
// card's real content. G1 fix: that card used to carry only an id, so it rendered just the word
// "Notification"; convex/react's `useQueries` lets a variable number of ids load reactively without
// breaking the rules of hooks (one `useQuery` per row isn't an option in a list).
import { useMemo } from 'react';
import { useQueries } from 'convex/react';
import type { Infer } from 'convex/values';
import type { notificationDoc } from '@shared/domain/api';
import type { Id } from '@shared/domain/validators';
import { api } from './api';

export type NotificationDoc = Infer<typeof notificationDoc>;

/** notificationId -> its doc. Omits ids that are still loading, errored (e.g. not found) or not yet
 * readable by the viewer — callers treat a missing entry as "not loaded yet". */
export function useNotificationsFor(notificationIds: Id<'notifications'>[]): Record<string, NotificationDoc> {
  const queries = useMemo(
    () => Object.fromEntries(notificationIds.map((id) => [id, { query: api.notifications.get, args: { notificationId: id } }])),
    [notificationIds],
  );
  const results = useQueries(queries);
  return useMemo(() => {
    const out: Record<string, NotificationDoc> = {};
    for (const [id, result] of Object.entries(results)) if (result && !(result instanceof Error)) out[id] = result as NotificationDoc;
    return out;
  }, [results]);
}
