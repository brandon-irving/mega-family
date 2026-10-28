// Boards KidsChore (the kid taps Done!) and KidsChoreApprove (a parent releases Mega Bucks or says "Not
// yet"), both from one `{ kind: 'chore', claimId }` card. Approving is `bucks.release` with source chore
// (adults only, once per claim); "Not yet" is `chores.decline`. The kid's Done is `chores.markDone`.
import { useState } from 'react';
import type { Infer } from 'convex/values';
import type { choreView } from '@shared/domain/api';
import type { Id } from '@shared/domain/validators';
import { fillCopy, KIDS_COPY } from '@shared/config/copy';
import { MEGA_BUCKS } from '@shared/config/store';
import { useChoreActions, useChoreClaim, useReleaseBucks } from '@/data/useKids';
import { useFamilyDirectory } from '@/features/shell/familyDirectory';
import { useRunAction } from '@/features/shell/useRunAction';
import { BucksStepper, type CardAction, CardActions, ThreadCard } from '@/ui/ThreadCard';
import { CardFallback } from './CardFallback';

export type ChoreView = Infer<typeof choreView>;

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function KidChoreView({
  view,
  megaName,
  busy,
  error,
  onDone,
  onSnooze,
  snoozing,
  snoozedUntil,
}: {
  view: ChoreView;
  megaName: string;
  busy?: boolean;
  error?: string | null;
  onDone: () => void;
  /** Board KidsChore: "In 10 min" (`chores.snooze`). */
  onSnooze?: () => void;
  snoozing?: boolean;
  /** When the snoozed reminder is due; the card says so and drops the button. */
  snoozedUntil?: number | null;
}) {
  const claim = view.today;
  const state = claim?.status ?? 'due';
  const status =
    state === 'claimed'
      ? { text: KIDS_COPY.choreClaimed, tone: 'warn' as const }
      : state === 'approved'
        ? { text: fillCopy(KIDS_COPY.choreApproved, { n: view.chore.bucks }), tone: 'success' as const }
        : state === 'declined'
          ? { text: KIDS_COPY.choreDeclinedKid, tone: 'muted' as const }
          : error
            ? { text: error, tone: 'warn' as const }
            : snoozedUntil
              ? { text: fillCopy(KIDS_COPY.choreSnoozed, { time: clock(snoozedUntil) }), tone: 'muted' as const }
              : undefined;
  const canClaim = state === 'due' || state === 'declined';
  const actions: CardAction[] = [{ id: 'done', label: KIDS_COPY.choreDone, onPress: onDone, loading: busy }];
  if (onSnooze && !snoozedUntil) actions.push({ id: 'snooze', label: KIDS_COPY.choreSnooze, onPress: onSnooze, loading: snoozing, variant: 'ghost' });
  return (
    <ThreadCard from={fillCopy(KIDS_COPY.choreFrom, { mega: megaName })} title={view.chore.title} big body={fillCopy(KIDS_COPY.choreBody, { n: view.chore.bucks })} status={status}>
      {canClaim && <CardActions cols={1} actions={actions} />}
    </ThreadCard>
  );
}

export function ChoreApproveView({
  view,
  kidName,
  kidMega,
  canRelease,
  amount,
  onAmount,
  busy,
  error,
  onRelease,
  onDecline,
}: {
  view: ChoreView;
  kidName: string;
  kidMega: string;
  canRelease: boolean;
  amount: number;
  onAmount: (n: number) => void;
  busy?: string | null;
  error?: string | null;
  onRelease: () => void;
  onDecline: () => void;
}) {
  const claim = view.today;
  const from = fillCopy(KIDS_COPY.choreApproveFrom, { mega: kidMega });
  if (!claim || claim.status === 'due') return <ThreadCard from={from} title={fillCopy(KIDS_COPY.summaryWaiting, { kid: kidName })} />;
  const status =
    claim.status === 'approved'
      ? { text: fillCopy(KIDS_COPY.released, { n: amount, kid: kidName, mega: kidMega }), tone: 'success' as const }
      : claim.status === 'declined'
        ? { text: fillCopy(KIDS_COPY.choreDeclined, { mega: kidMega, kid: kidName }), tone: 'muted' as const }
        : error
          ? { text: error, tone: 'warn' as const }
          : undefined;
  const open = claim.status === 'claimed' && canRelease;
  return (
    <ThreadCard
      from={from}
      title={fillCopy(KIDS_COPY.choreApproveTitle, { kid: kidName, chore: view.chore.title })}
      body={fillCopy(KIDS_COPY.choreApproveBody, { time: claim.claimedAt ? clock(claim.claimedAt) : '', n: view.chore.bucks })}
      status={status}
      foot={KIDS_COPY.releaseFoot}
    >
      {open && (
        <>
          <BucksStepper value={amount} min={MEGA_BUCKS.minRelease} max={MEGA_BUCKS.maxRelease} onChange={onAmount} label={KIDS_COPY.stepperLabel} fewerLabel={KIDS_COPY.fewer} moreLabel={KIDS_COPY.more} />
          <CardActions
            actions={[
              { id: 'release', label: fillCopy(KIDS_COPY.release, { n: amount }), onPress: onRelease, loading: busy === 'release', disabled: !!busy },
              { id: 'decline', label: KIDS_COPY.releaseNotYet, onPress: onDecline, variant: 'ghost', loading: busy === 'decline', disabled: !!busy },
            ]}
          />
        </>
      )}
    </ThreadCard>
  );
}

export function ChoreCard({ claimId, megaName }: { claimId: Id<'choreClaims'>; megaName: string }) {
  const state = useChoreClaim(claimId);
  const dir = useFamilyDirectory();
  const { markDone, decline, snooze } = useChoreActions();
  const release = useReleaseBucks();
  const { busy, error, run } = useRunAction();
  const [amount, setAmount] = useState<number | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
  if (state.status !== 'ok') return <CardFallback state={state} from={megaName} />;
  const view = state.data;
  const kidId = view.chore.forMemberId;
  if (dir.me?.id === kidId) {
    return (
      <KidChoreView
        view={view}
        megaName={dir.megaNameOf(kidId) || megaName}
        busy={busy === 'done'}
        error={error}
        onDone={() => run('done', () => markDone({ choreId: view.chore._id }))}
        snoozing={busy === 'snooze'}
        snoozedUntil={snoozedUntil}
        onSnooze={() => run('snooze', async () => setSnoozedUntil((await snooze({ choreId: view.chore._id })).remindAt))}
      />
    );
  }
  const value = amount ?? view.chore.bucks ?? MEGA_BUCKS.defaults.chore;
  return (
    <ChoreApproveView
      view={view}
      kidName={dir.nameOf(kidId)}
      kidMega={dir.megaNameOf(kidId)}
      canRelease={!!dir.me?.isAdult}
      amount={value}
      onAmount={setAmount}
      busy={busy}
      error={error}
      onRelease={() => run('release', () => release({ source: { kind: 'chore', claimId }, amount: value }))}
      onDecline={() => run('decline', () => decline({ claimId }))}
    />
  );
}
