// Profile → Activity (canvas Screen 16, board ProfileActivity), in the MEGA profile's stack. Admin only (the
// profile shows the row only to the admin; `megas.activity` refuses anyone else). Times and "Today" follow the
// family clock and timezone, never the phone's.
import { useState } from 'react';
import { router } from 'expo-router';
import { G5_UI_COPY as U } from '@shared/config/copy';
import { useViewer } from '@/data/useViewer';
import { useForgetMemory, useMegaActivity, useMemories } from '@/data/useMega';
import { useFamilyNow } from '@/data/useShopping';
import { ActivityContent, type ActivityFilter, type MemoryDoc } from '@/features/settings/ActivityContent';
import { MegaLoader } from '@/features/walkers';
import { Sheet } from '@/ui/Sheet';

/** How many recent memories the "learned" section lists before "Everything … remembers". */
const LEARNED_SHOWN = 5;

export default function ActivityRoute() {
  const viewer = useViewer();
  const isAdmin = viewer?.member.role === 'admin';
  const activity = useMegaActivity(isAdmin);
  const memories = useMemories(undefined);
  const forget = useForgetMemory();
  const now = useFamilyNow();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  // A forgotten memory leaves the live list at once; keep it here so its row can say "Forgotten…".
  const [forgotten, setForgotten] = useState<MemoryDoc[]>([]);

  if (!viewer || now === undefined) return <MegaLoader />;

  return (
    <Sheet title={U.activityTitle} onClose={() => router.back()}>
      <ActivityContent
        items={activity.results}
        memories={[...memories.results.slice(0, LEARNED_SHOWN), ...forgotten.filter((f) => !memories.results.some((m) => m._id === f._id))]}
        forgotten={forgotten.map((f) => f._id)}
        filter={filter}
        onFilter={setFilter}
        megaName={viewer.mega?.name ?? 'MEGA'}
        now={now}
        timeZone={viewer.family.timezone}
        canLoadMore={activity.status === 'CanLoadMore'}
        onLoadMore={() => activity.loadMore(40)}
        onForget={(memoryId) => {
          const doc = memories.results.find((m) => m._id === memoryId);
          void forget({ memoryId })
            .then(() => doc && setForgotten((f) => [...f, doc]))
            .catch(() => null);
        }}
        onOpenMemories={() => router.push('/mega-profile/memories' as never)}
      />
    </Sheet>
  );
}
