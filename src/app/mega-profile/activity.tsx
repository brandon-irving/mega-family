// Profile → Activity (canvas Screen 16, board ProfileActivity), in the MEGA profile's stack. Admin only (the
// profile shows the row only to the admin; `megas.activity` refuses anyone else). Times and "Today" follow the
// family clock and timezone, never the phone's.
import { useMemo, useState } from 'react';
import { router } from '@/features/shell/navigation';
import { G5_UI_COPY as U } from '@shared/config/copy';
import { useViewer } from '@/data/useViewer';
import { useFamilyMembers } from '@/data/useFamily';
import { useForgetMemory, useMegaActivity, useMemories } from '@/data/useMega';
import { useFamilyNow } from '@/data/useShopping';
import { ActivityContent, type ActivityFilter, type MemoryDoc } from '@/features/settings/ActivityContent';
import { AdultOnly } from '@/features/shell/RoleGate';
import { MegaLoader } from '@/features/walkers';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useRunAction } from '@/features/shell/useRunAction';
import { useTokens } from '@/ui/theme';

/** How many recent memories the "learned" section lists before "Everything … remembers". */
const LEARNED_SHOWN = 5;

/** The admin's alone (G5 UX review): anyone else is sent back to chat before the activity query runs. */
export default function ActivityRoute() {
  return (
    <AdultOnly adminOnly>
      <ActivityScreen />
    </AdultOnly>
  );
}

function ActivityScreen() {
  const viewer = useViewer();
  const tokens = useTokens();
  const forgetAction = useRunAction();
  const isAdmin = viewer?.member.role === 'admin';
  const activity = useMegaActivity(isAdmin);
  const memories = useMemories(undefined);
  const forget = useForgetMemory();
  const now = useFamilyNow();
  const members = useFamilyMembers();
  // "You" for the viewer, a name for anyone else in the family (the Activity person chip).
  const who = useMemo(
    () => ({ viewerId: viewer?.member._id ?? '', names: Object.fromEntries((members ?? []).map((c) => [c.member._id, c.member.name])) }),
    [viewer?.member._id, members],
  );
  const [filter, setFilter] = useState<ActivityFilter>('all');
  // A forgotten memory leaves the live list at once; keep it here so its row can say "Forgotten…".
  const [forgotten, setForgotten] = useState<MemoryDoc[]>([]);

  if (!viewer || now === undefined) return <MegaLoader />;

  return (
    <Sheet title={U.activityTitle} onClose={() => router.back()} scroll={false}>
      {forgetAction.error ? <Text accessibilityRole="alert" style={{ color: tokens.danger, padding: tokens.spacing.md }}>{forgetAction.error}</Text> : null}
      <ActivityContent
        who={who}
        items={activity.results}
        memories={[...memories.results.slice(0, LEARNED_SHOWN), ...forgotten.filter((f) => !memories.results.some((m) => m._id === f._id))]}
        forgotten={forgotten.map((f) => f._id)}
        filter={filter}
        onFilter={setFilter}
        megaName={viewer.mega?.name ?? 'MEGA'}
        now={now}
        timeZone={viewer.family.timezone}
        canLoadMore={activity.status === 'CanLoadMore'}
        loadingMore={activity.status === 'LoadingMore'}
        forgetting={forgetAction.busy}
        onLoadMore={() => activity.loadMore(40)}
        onForget={(memoryId) => {
          const doc = memories.results.find((m) => m._id === memoryId);
          if (forgetAction.busy) return;
          void forgetAction.run(memoryId, () => forget({ memoryId }))
            .then((ok) => ok && doc && setForgotten((f) => [...f.slice(-(LEARNED_SHOWN - 1)), doc]));
        }}
        onOpenMemories={() => router.push('/mega-profile/memories' as never)}
      />
    </Sheet>
  );
}
