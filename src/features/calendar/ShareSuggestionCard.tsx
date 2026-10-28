// Board CalShare: "Share it with the household?" — only ever shown to the item's owner, and answering is
// the owner's own act (`shareSuggestions.answer`). The suggestion itself never changes anything; the
// explicit-share rule (owner, Oct 26) is enforced on the server, this card just asks.
import type { Id } from '@shared/domain/validators';
import { CALENDAR_COPY, fillCopy, SHARE_RULE_COPY } from '@shared/config/copy';
import { FAMILY_MEGA_DEFAULTS } from '@shared/config/looks';
import { useAnswerShareSuggestion, useShareSuggestion } from '@/data/useCalendarLayers';
import { useRunAction } from '@/features/shell/useRunAction';
import { CardFallback } from '@/features/kids/CardFallback';
import { CardActions, ThreadCard } from '@/ui/ThreadCard';

export type ShareStatus = 'pending' | 'shared' | 'kept' | 'expired';

export function ShareSuggestionView({
  megaName,
  hubName,
  preview,
  status,
  busy,
  error,
  onAnswer,
}: {
  megaName: string;
  hubName: string;
  preview: string;
  status: ShareStatus;
  busy?: string | null;
  error?: string | null;
  onAnswer: (share: boolean) => void;
}) {
  const line =
    status === 'shared'
      ? { text: fillCopy(CALENDAR_COPY.shared, { hub: hubName }), tone: 'household' as const }
      : status === 'kept'
        ? { text: CALENDAR_COPY.kept, tone: 'muted' as const }
        : status === 'expired'
          ? { text: CALENDAR_COPY.shareExpired, tone: 'muted' as const }
          : error
            ? { text: error, tone: 'warn' as const }
            : undefined;
  return (
    <ThreadCard from={megaName} title={CALENDAR_COPY.shareTitle} body={fillCopy(CALENDAR_COPY.shareBody, { preview })} status={line} foot={SHARE_RULE_COPY}>
      {status === 'pending' && (
        <CardActions
          actions={[
            { id: 'share', label: CALENDAR_COPY.shareIt, onPress: () => onAnswer(true), loading: busy === 'share', disabled: !!busy },
            { id: 'keep', label: CALENDAR_COPY.keepPrivate, onPress: () => onAnswer(false), variant: 'ghost', loading: busy === 'keep', disabled: !!busy },
          ]}
        />
      )}
    </ThreadCard>
  );
}

export function ShareSuggestionCard({ suggestionId, megaName }: { suggestionId: Id<'shareSuggestions'>; megaName: string }) {
  const state = useShareSuggestion(suggestionId);
  const answer = useAnswerShareSuggestion();
  const { busy, error, run } = useRunAction();
  if (state.status !== 'ok') return <CardFallback state={state} from={megaName} />;
  return (
    <ShareSuggestionView
      megaName={megaName}
      hubName={FAMILY_MEGA_DEFAULTS.name}
      preview={state.data.preview}
      status={state.data.status}
      busy={busy}
      error={error}
      onAnswer={(share) => run(share ? 'share' : 'keep', () => answer({ suggestionId, share }))}
    />
  );
}
