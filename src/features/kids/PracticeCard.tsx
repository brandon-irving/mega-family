// Boards KidsPractice / KidsHint / KidsDone (the kid) and KidsSummary (the parent), all from one
// `{ kind: 'practice', setId }` card: `practice.get` decides which side the viewer sees. The kid answers one
// question at a time with big 2-up choices and can ask "Hint, please" (a guiding question, never the
// answer — the server never sends the correct choice to anyone, CONTRACT v0.13 `practiceView`). The parent
// sees the summary and releases Mega Bucks with the stepper (`bucks.release`, adults only, once per set).
import { useState } from 'react';
import type { Infer } from 'convex/values';
import type { practiceView } from '@shared/domain/api';
import type { Id } from '@shared/domain/validators';
import { fillCopy, KIDS_COPY } from '@shared/config/copy';
import { MEGA_BUCKS } from '@shared/config/store';
import { usePractice, usePracticeActions, useReleaseBucks } from '@/data/useKids';
import { useFamilyDirectory } from '@/features/shell/familyDirectory';
import { useRunAction } from '@/features/shell/useRunAction';
import { BucksStepper, CardActions, ChoiceGrid, HintNote, type ProgressDot, ThreadCard } from '@/ui/ThreadCard';
import { CardFallback } from './CardFallback';

export type PracticeView = Infer<typeof practiceView>;

/** The question the kid is on: the first one not yet answered correctly (a wrong answer can be retried). */
export function currentQuestionIndex(view: PracticeView): number {
  const i = view.questions.findIndex((q) => !q.answered?.correct);
  return i < 0 ? view.questions.length : i;
}

function dotsFor(view: PracticeView, current: number): ProgressDot[] {
  return view.questions.map((_, i) => (i < current ? 'done' : i === current ? 'current' : 'todo'));
}

function hintsLine(hints: number): string {
  return hints === 0 ? KIDS_COPY.doneNoHints : hints === 1 ? KIDS_COPY.doneHintsOne : fillCopy(KIDS_COPY.doneHints, { hints });
}

export function KidPracticeView({
  view,
  megaName,
  missIndex,
  busy,
  error,
  onPick,
  onHint,
}: {
  view: PracticeView;
  megaName: string;
  missIndex: number | null;
  busy?: string | null;
  error?: string | null;
  onPick: (questionId: string, choiceIndex: number) => void;
  onHint: (questionId: string) => void;
}) {
  const from = fillCopy(KIDS_COPY.practiceFrom, { mega: megaName });
  if (view.status === 'drafting') return <ThreadCard from={from} title={KIDS_COPY.drafting} />;
  if (view.status === 'failed') return <ThreadCard from={from} title={KIDS_COPY.notReady} />;
  const total = view.questions.length;
  const current = currentQuestionIndex(view);
  if (view.status === 'done' || current >= total) {
    const correct = view.summary?.correct ?? view.questions.filter((q) => q.answered?.correct && q.answered.tries === 1).length;
    const hints = view.summary?.hintsUsed ?? view.questions.filter((q) => q.hint).length;
    return (
      <ThreadCard
        from={from}
        progress={{ dots: view.questions.map(() => 'done'), label: KIDS_COPY.finished }}
        title={fillCopy(KIDS_COPY.doneTitle, { correct, total: view.summary?.total ?? total })}
        big
        body={[hintsLine(hints), view.summary?.note].filter(Boolean).join(' ')}
        status={{ text: KIDS_COPY.doneStatus, tone: 'hint' }}
      />
    );
  }
  const q = view.questions[current];
  const status = missIndex !== null ? { text: q.hint ? KIDS_COPY.notQuiteHinted : KIDS_COPY.notQuite, tone: 'warn' as const } : error ? { text: error, tone: 'warn' as const } : undefined;
  return (
    <ThreadCard from={from} progress={{ dots: dotsFor(view, current), label: fillCopy(KIDS_COPY.progress, { n: current + 1, total }) }} title={q.prompt} big status={status}>
      {q.hint ? <HintNote text={q.hint} /> : null}
      <ChoiceGrid choices={q.choices} missIndex={missIndex} disabled={!!busy} onPick={(i) => onPick(q.id, i)} />
      {!q.hint && <CardActions cols={1} actions={[{ id: 'hint', label: KIDS_COPY.hintPlease, onPress: () => onHint(q.id), variant: 'ghost', loading: busy === 'hint' }]} />}
    </ThreadCard>
  );
}

export function PracticeSummaryView({
  view,
  kidName,
  kidMega,
  amount,
  onAmount,
  outcome,
  busy,
  error,
  onRelease,
  onLater,
}: {
  view: PracticeView;
  kidName: string;
  kidMega: string;
  amount: number;
  onAmount: (n: number) => void;
  outcome: 'later' | null;
  busy?: boolean;
  error?: string | null;
  onRelease: () => void;
  onLater: () => void;
}) {
  const from = fillCopy(KIDS_COPY.summaryFrom, { mega: kidMega });
  if (view.status !== 'done' || !view.summary) return <ThreadCard from={from} title={fillCopy(KIDS_COPY.summaryWaiting, { kid: kidName })} />;
  const { correct, total, hintsUsed, minutes, note } = view.summary;
  const released = view.released;
  const status = released
    ? { text: fillCopy(KIDS_COPY.released, { n: released.amount, kid: kidName, mega: kidMega }), tone: 'success' as const }
    : outcome === 'later'
      ? { text: fillCopy(KIDS_COPY.notReleased, { kid: kidName }), tone: 'muted' as const }
      : error
        ? { text: error, tone: 'warn' as const }
        : undefined;
  const open = !released && outcome !== 'later' && view.canRelease;
  return (
    <ThreadCard
      from={from}
      title={fillCopy(KIDS_COPY.summaryTitle, { kid: kidName, correct, total })}
      body={[note, fillCopy(KIDS_COPY.summaryStats, { hints: hintsUsed, minutes })].filter(Boolean).join(' ')}
      status={status}
      foot={KIDS_COPY.releaseFoot}
    >
      {open && (
        <>
          <BucksStepper value={amount} min={MEGA_BUCKS.minRelease} max={MEGA_BUCKS.maxRelease} onChange={onAmount} label={KIDS_COPY.stepperLabel} fewerLabel={KIDS_COPY.fewer} moreLabel={KIDS_COPY.more} />
          <CardActions
            actions={[
              { id: 'release', label: fillCopy(KIDS_COPY.release, { n: amount }), onPress: onRelease, loading: busy },
              { id: 'later', label: KIDS_COPY.releaseLater, onPress: onLater, variant: 'ghost', disabled: busy },
            ]}
          />
        </>
      )}
    </ThreadCard>
  );
}

export function PracticeCard({ setId, megaName }: { setId: Id<'practiceSets'>; megaName: string }) {
  const state = usePractice(setId);
  const dir = useFamilyDirectory();
  const { answer, hint } = usePracticeActions();
  const release = useReleaseBucks();
  const { busy, error, run } = useRunAction();
  const [miss, setMiss] = useState<{ questionId: string; index: number } | null>(null);
  const [amount, setAmount] = useState<number>(MEGA_BUCKS.defaults.practice);
  const [outcome, setOutcome] = useState<'later' | null>(null);
  if (state.status !== 'ok') return <CardFallback state={state} from={megaName} />;
  const view = state.data;
  const kidMega = dir.megaNameOf(view.forMemberId);
  if (dir.me?.id === view.forMemberId) {
    const current = view.questions[currentQuestionIndex(view)];
    return (
      <KidPracticeView
        view={view}
        megaName={kidMega || megaName}
        missIndex={miss && current && miss.questionId === current.id ? miss.index : null}
        busy={busy}
        error={error}
        onPick={(questionId, choiceIndex) =>
          run('answer', async () => {
            const res = await answer({ setId, questionId, choiceIndex });
            setMiss(res.correct ? null : { questionId, index: choiceIndex });
          })
        }
        onHint={(questionId) => run('hint', () => hint({ setId, questionId }))}
      />
    );
  }
  return (
    <PracticeSummaryView
      view={view}
      kidName={dir.nameOf(view.forMemberId)}
      kidMega={kidMega}
      amount={amount}
      onAmount={setAmount}
      outcome={outcome}
      busy={busy === 'release'}
      error={error}
      onLater={() => setOutcome('later')}
      onRelease={() => run('release', () => release({ source: { kind: 'practice', setId }, amount }))}
    />
  );
}
