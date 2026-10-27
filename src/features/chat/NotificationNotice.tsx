// G3 review fix (BLOCKER, "From a notification" notice — CONTRACT §6, PLAN §6, design board
// design/build/Push.template.html ~line 125, the "From a notification · {{when}}" pill): shown above
// the one message the chat thread was actually entered for (tap, cold start, or a deep link whose
// message carries `fromNotificationId`, CONTRACT §2 `messages.fromNotificationId`). Client-side
// presentation only, per the review item: no new backend data — `sentAt` is already fetched through
// `notifications.get` (CONTRACT §4) for the thread's `{ kind: 'notification' }` cards (useNotificationsFor),
// reused here for whichever notification sent the target message.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

/** Frequent enough that "2m ago" visibly advances without the pill ever looking stale, cheap enough
 * that a 15s tick costs nothing — this is a single small pill, not a list of many. */
const RELATIVE_TIME_TICK_MS = 15_000;

export function formatRelativeTime(fromMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (diffSec < 60) return 'Just now';
  const minutes = Math.round(diffSec / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** `undefined`/`null` input (the notification doc hasn't loaded, or there's nothing to show) means "not
 * shown" — ticks its own clock on an interval so the pill's text updates live without the parent
 * re-rendering the whole message row just to keep a relative time current. */
export function useRelativeTime(atMs: number | null | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (atMs == null) return;
    const id = setInterval(() => setNow(Date.now()), RELATIVE_TIME_TICK_MS);
    return () => clearInterval(id);
  }, [atMs]);
  if (atMs == null) return null;
  return formatRelativeTime(atMs, now);
}

export function NotificationNotice({ sentAt }: { sentAt: number | null | undefined }) {
  const tokens = useTokens();
  const when = useRelativeTime(sentAt);
  if (when == null) return null;
  return (
    <View
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.xs,
        backgroundColor: tokens.surface,
        borderColor: tokens.line,
        borderWidth: 1,
        borderRadius: tokens.radii.pill,
        paddingVertical: tokens.spacing.xs,
        paddingHorizontal: tokens.spacing.md,
        marginBottom: tokens.spacing.sm,
      }}
    >
      <Text variant="caption" color="muted">
        From a notification · {when}
      </Text>
    </View>
  );
}
