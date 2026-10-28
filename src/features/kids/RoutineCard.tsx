// Boards KidsBedtime (tomorrow-prep checklist in the thread) and KidsMorning (opened full screen from the
// card) from one `{ kind: 'routine', runId }` card. Bedtime's calendar items come only from tomorrow's
// household-layer events (the server builds the run; private events never feed it).
//
// CONTRACT NOTE (for the backend, see the GD frontend report): there is no read-by-runId query, so the card
// finds its run among the kid's own `routines.today` runs (morning + bedtime). A card for an older day's run
// shows the "not ready" line. A `routines.run({ runId })` query would let any day's card render.
import { useState } from 'react';
import { router } from 'expo-router';
import type { Infer } from 'convex/values';
import type { routineRunDoc } from '@shared/domain/api';
import type { Id } from '@shared/domain/validators';
import { fillCopy, KIDS_COPY } from '@shared/config/copy';
import { useCheckRoutineStep, useRoutineToday } from '@/data/useKids';
import { useFamilyDirectory } from '@/features/shell/familyDirectory';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardActions, CheckList, ThreadCard } from '@/ui/ThreadCard';
import { CardFallback } from './CardFallback';

export type RoutineRun = Infer<typeof routineRunDoc>;

/** Local taps win until the server's value catches up, so a checkbox never flickers back. */
export function useOptimisticSteps(run: RoutineRun | null) {
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const steps = (run?.steps ?? []).map((s) => ({ ...s, done: local[s.id] ?? s.done }));
  return { steps, setStep: (id: string, done: boolean) => setLocal((m) => ({ ...m, [id]: done })) };
}

export function BedtimeView({ megaName, steps, error, onToggle }: { megaName: string; steps: { id: string; label: string; detail?: string; done: boolean }[]; error?: string | null; onToggle: (id: string, done: boolean) => void }) {
  const packed = steps.filter((s) => s.done).length;
  const all = steps.length > 0 && packed === steps.length;
  return (
    <ThreadCard
      from={fillCopy(KIDS_COPY.bedtimeFrom, { mega: megaName })}
      title={KIDS_COPY.bedtimeTitle}
      big
      body={fillCopy(KIDS_COPY.bedtimeBody, { n: packed, total: steps.length })}
      status={all ? { text: KIDS_COPY.bedtimeAllPacked, tone: 'hint' } : error ? { text: error, tone: 'warn' } : undefined}
    >
      <CheckList items={steps.map((s) => ({ id: s.id, label: s.label, sub: s.detail, done: s.done }))} onToggle={onToggle} />
    </ThreadCard>
  );
}

export function MorningCardView({ megaName, done, total, onOpen }: { megaName: string; done: number; total: number; onOpen: () => void }) {
  return (
    <ThreadCard
      from={fillCopy(KIDS_COPY.morningFrom, { mega: megaName })}
      title={done >= total && total > 0 ? KIDS_COPY.morningFinishedTitle : KIDS_COPY.morningCardTitle}
      big
      progress={{ dots: Array.from({ length: total }, (_, i) => (i < done ? 'done' : i === done ? 'current' : 'todo')), label: fillCopy(KIDS_COPY.morningStep, { n: Math.min(done + 1, total), total }) }}
    >
      <CardActions cols={1} actions={[{ id: 'open', label: KIDS_COPY.morningOpen, onPress: onOpen }]} />
    </ThreadCard>
  );
}

export function RoutineCard({ runId, megaName }: { runId: Id<'routineRuns'>; megaName: string }) {
  const bedtime = useRoutineToday('bedtime');
  const morning = useRoutineToday('morning');
  const dir = useFamilyDirectory();
  const check = useCheckRoutineStep();
  const { error, run } = useRunAction();
  const found = [bedtime, morning].map((s) => (s.status === 'ok' ? s.data : null)).find((r) => r?._id === runId) ?? null;
  const { steps, setStep } = useOptimisticSteps(found);
  if (!found) {
    const loading = bedtime.status === 'loading' || morning.status === 'loading';
    return <CardFallback state={loading ? { status: 'loading' } : bedtime.status === 'error' ? bedtime : { status: 'error', error: new Error('not today') }} from={megaName} />;
  }
  const kidMega = dir.megaNameOf(found.memberId) || megaName;
  if (found.kind === 'morning') {
    return <MorningCardView megaName={kidMega} done={steps.filter((s) => s.done).length} total={steps.length} onOpen={() => router.push('/routine/morning')} />;
  }
  return (
    <BedtimeView
      megaName={kidMega}
      steps={steps}
      error={error}
      onToggle={(id, done) => {
        setStep(id, done);
        void run('check', () => check({ runId, stepId: id, done }));
      }}
    />
  );
}
