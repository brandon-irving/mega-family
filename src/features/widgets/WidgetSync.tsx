// G8 (G8.md frontend task 1; invariants 3 and 9): keeps the home- and lock-screen widgets in step with the
// viewer's `widgets.next` timeline. Mounted once at the root (src/app/_layout.tsx), renders nothing.
//
// - Signed in as a member: each new timeline is written (throttled to WIDGET_TIMELINE.minRefreshSeconds), and
//   coming back to the foreground re-writes it unthrottled (WidgetKit may have rolled past entries).
// - Signed out, or the member changes: the signed-out widget is written first (the writer tracks whose
//   timeline is showing), so one person's day never sits on the next person's lock screen.
// - The no-flicker query wrapper keeps the last value across an argument change, so the member part is keyed
//   by member id: a new member starts with no timeline rather than briefly holding the previous one's.
// - Off iOS the writer is a no-op (src/services/widgetSync.ts) and the widgets are stand-ins
//   (src/widgets/registry.ts), so this is safe to mount everywhere.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useViewer } from '@/data/useViewer';
import { useWidgetTimeline } from '@/data/useWidgets';
import { useAuthState } from '@/services/auth';
import { createWidgetWriter, widgetColors } from '@/services/widgetSync';
import { useTokens } from '@/ui/theme';
// The real widgets on iOS, a no-op pair elsewhere (registry.ios.ts / registry.ts), so the web never loads @expo/ui.
import { MegaNext, MegaTalk } from '@/widgets/registry';
import type { WidgetColors } from '@/widgets/types';

const writer = createWidgetWriter({ next: MegaNext, talk: MegaTalk });

export function WidgetSync() {
  const tokens = useTokens();
  const auth = useAuthState();
  const viewer = useViewer();
  const colors = useMemo(() => widgetColors(tokens), [tokens]);
  const memberId = auth.status === 'signedIn' && viewer ? viewer.member._id : null;
  const signedOut = auth.status === 'signedOut' || (auth.status === 'signedIn' && viewer === null);

  useEffect(() => {
    if (signedOut) writer.signOut(colors);
  }, [signedOut, colors]);

  return memberId ? <MemberWidgets key={memberId} memberId={memberId} colors={colors} /> : null;
}

function MemberWidgets({ memberId, colors }: { memberId: string; colors: WidgetColors }) {
  const timeline = useWidgetTimeline(true);
  const [foregrounds, setForegrounds] = useState(0);
  const forcedFor = useRef(-1);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegrounds((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!timeline) return;
    const force = forcedFor.current !== foregrounds;
    forcedFor.current = foregrounds;
    writer.write(timeline, colors, { memberId, force });
  }, [timeline, colors, memberId, foregrounds]);

  return null;
}
