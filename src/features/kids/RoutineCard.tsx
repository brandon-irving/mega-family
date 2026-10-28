// Boards KidsBedtime (tomorrow-prep checklist in the thread) and KidsMorning (opened full screen from the
// card) from one `{ kind: 'routine', runId }` card. Bedtime's calendar items come only from tomorrow's
// household-layer events (the server builds the run; private events never feed it).
// The card loads its run by id (`routines.run`, v0.13a), so a card from any day renders.
import { useState } from 'react';
import { router } from 'expo-router';
import type { Infer } from 'convex/values';
import type { routineRunDoc } from '@shared/domain/api';
import type { Id } from '@shared/domain/validators';
import { fillCopy, KIDS_COPY } from '@shared/config/copy';
import { formatLocalTime } from '@shared/time';
import { useCheckRoutineStep, useRoutineRun } from '@/data/useKids';
import { useViewer } from '@/data/useViewer';
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

/** Board KidsBedtime's title names tomorrow's household event and its time ("Soccer practice tomorrow at
 * 4:30 PM", in the family's time zone `tz`); without a time it's "Soccer practice tomorrow", and a run with
 * no calendar-sourced step gets the generic line. */
export function bedtimeTitle<S extends { source?: { title?: string; start?: number } }>(steps: readonly S[], tz?: string): string {
  const source = steps.find((s) => s.source?.title)?.source;
  if (!source?.title) return KIDS_COPY.bedtimeTitle;
  if (source.start !== undefined && tz) return fillCopy(KIDS_COPY.bedtimeTitleEventAt, { event: source.title, time: formatLocalTime(source.start, tz) });
  return fillCopy(KIDS_COPY.bedtimeTitleEvent, { event: source.title });
}

export function BedtimeView({ megaName, title = KIDS_COPY.bedtimeTitle, steps, error, onToggle }: { megaName: string; title?: string; steps: { id: string; label: string; detail?: string; done: boolean }[]; error?: string | null; onToggle: (id: string, done: boolean) => void }) {
  const packed = steps.filter((s) => s.done).length;
  const all = steps.length > 0 && packed === steps.length;
  return (
    <ThreadCard
      from={fillCopy(KIDS_COPY.bedtimeFrom, { mega: megaName })}
      title={title}
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
  const state = useRoutineRun(runId);
  const viewer = useViewer();
  const dir = useFamilyDirectory();
  const check = useCheckRoutineStep();
  const { error, run } = useRunAction();
  const found = state.status === 'ok' ? state.data : null;
  const { steps, setStep } = useOptimisticSteps(found);
  if (state.status !== 'ok' || !found) return <CardFallback state={state.status === 'ok' ? { status: 'error', error: new Error('missing run') } : state} from={megaName} />;
  const kidMega = dir.megaNameOf(found.memberId) || megaName;
  if (found.kind === 'morning') {
    return <MorningCardView megaName={kidMega} done={steps.filter((s) => s.done).length} total={steps.length} onOpen={() => router.push('/routine/morning')} />;
  }
  return (
    <BedtimeView
      megaName={kidMega}
      title={bedtimeTitle(found.steps, viewer?.family.timezone)}
      steps={steps}
      error={error}
      onToggle={(id, done) => {
        setStep(id, done);
        void run('check', () => check({ runId, stepId: id, done }));
      }}
    />
  );
}
