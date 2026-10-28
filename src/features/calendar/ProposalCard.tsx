// Boards CalClash / CalClashDone: Hub's one proposed fix for a clash between two household events, labeled
// as AI (the agent's identity is disclosed: the server's `disclosure` line, config PROPOSAL_DISCLOSURE),
// with before/after. Nothing changes until the Admin approves (`proposals.decide`, admin only — CLASH.
// approverRole); everyone else sees "Waiting for Admin to approve". The fix's title and text are worded by
// Muse Wonder on the server; this card shows them as-is.
import type { Infer } from 'convex/values';
import type { proposalView } from '@shared/domain/api';
import type { Id } from '@shared/domain/validators';
import { CALENDAR_COPY, fillCopy } from '@shared/config/copy';
import { useDecideProposal, useProposal } from '@/data/useCalendarLayers';
import { type FamilyDirectory, useFamilyDirectory } from '@/features/shell/familyDirectory';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { CardActions, CompareBoxes, ThreadCard } from '@/ui/ThreadCard';

export type ProposalView = Infer<typeof proposalView>;
type Snapshot = ProposalView['proposal']['before'];

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** "Soccer pickup · Partner" / "Thu 5:30 PM" — the viewer is "You". */
export function describeSnapshot(s: Snapshot, dir: Pick<FamilyDirectory, 'nameOf' | 'me'>): { line: string; sub: string } {
  const who = s.who.map((id) => (id === dir.me?.id ? CALENDAR_COPY.you : dir.nameOf(id))).filter(Boolean);
  return { line: who.length ? `${s.title} · ${who.join(', ')}` : s.title, sub: when(s.start) };
}

export function ProposalCardView({ view, dir, busy, error, onDecide }: { view: ProposalView; dir: Pick<FamilyDirectory, 'nameOf' | 'me'>; busy?: string | null; error?: string | null; onDecide: (approve: boolean) => void }) {
  const { proposal, mega, disclosure } = view;
  const before = describeSnapshot(proposal.before, dir);
  const after = describeSnapshot(proposal.after, dir);
  const isAdmin = !!dir.me?.isAdmin;
  const status =
    proposal.status === 'approved'
      ? { text: fillCopy(CALENDAR_COPY.approved, { name: proposal.decision ? dir.nameOf(proposal.decision.byId) : '' }), tone: 'success' as const }
      : proposal.status === 'rejected'
        ? { text: CALENDAR_COPY.rejected, tone: 'muted' as const }
        : proposal.status === 'expired'
          ? { text: CALENDAR_COPY.expired, tone: 'muted' as const }
          : proposal.status === 'stale'
            ? { text: CALENDAR_COPY.stale, tone: 'muted' as const }
            : error
              ? { text: error, tone: 'warn' as const }
              : { text: isAdmin ? CALENDAR_COPY.waitingAdmin : CALENDAR_COPY.waitingOther, tone: 'warn' as const };
  return (
    <ThreadCard
      from={fillCopy(CALENDAR_COPY.proposalFrom, { hub: mega.name })}
      fromColor={mega.hex}
      ai
      aiLabel={CALENDAR_COPY.aiTag}
      title={proposal.title}
      body={proposal.text}
      status={status}
      foot={`${disclosure} ${fillCopy(CALENDAR_COPY.proposalFoot, { hub: mega.name })}`}
    >
      <CompareBoxes beforeLabel={CALENDAR_COPY.now} before={before.line} beforeSub={before.sub} afterLabel={CALENDAR_COPY.afterApprove} after={after.line} afterSub={after.sub} />
      {proposal.status === 'pending' && isAdmin && (
        <CardActions
          actions={[
            { id: 'approve', label: CALENDAR_COPY.approve, onPress: () => onDecide(true), loading: busy === 'approve', disabled: !!busy },
            { id: 'reject', label: CALENDAR_COPY.reject, onPress: () => onDecide(false), variant: 'ghost', loading: busy === 'reject', disabled: !!busy },
          ]}
        />
      )}
    </ThreadCard>
  );
}

export function ProposalCard({ proposalId, megaName }: { proposalId: Id<'proposals'>; megaName: string }) {
  const state = useProposal(proposalId);
  const dir = useFamilyDirectory();
  const decide = useDecideProposal();
  const { busy, error, run } = useRunAction();
  if (state.status !== 'ok') return <CardFallback state={state} from={megaName} />;
  return <ProposalCardView view={state.data} dir={dir} busy={busy} error={error} onDecide={(approve) => run(approve ? 'approve' : 'reject', () => decide({ proposalId, approve }))} />;
}
