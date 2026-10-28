// Renders every result Card kind (CONTRACT §3): event, reminder, list, search, weather, travel,
// request and notification. Pure presentational — the "visibleTo" scope line is shared by the kinds
// that carry one. GD (CONTRACT v0.13): the eight demo kinds (homework, practice, chore, routine, bucks,
// shareSuggestion, proposal, gifts) carry only an id, so each renders its own connected card from
// src/features/{kids,calendar}, which loads the item through the query that re-checks who's asking. A kind
// this build doesn't know yet renders nothing rather than crashing the thread.
import type { Card as CardKind } from '@shared/domain/messages';
import { BUTTON_SETS } from '@shared/config/notifications';
import type { NotificationDoc } from '@/data/useNotifications';
import { ButtonRow } from '@/ui/ButtonRow';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { CardSkeleton } from '@/ui/ThreadCard';
import { KIDS_COPY } from '@shared/config/copy';
import { useTokens } from '@/ui/theme';
import { BucksCard } from '@/features/kids/BucksCard';
import { ChoreCard } from '@/features/kids/ChoreCard';
import { HomeworkCard } from '@/features/kids/HomeworkCard';
import { IntroCard } from '@/features/kids/IntroCard';
import { PracticeCard } from '@/features/kids/PracticeCard';
import { RoutineCard } from '@/features/kids/RoutineCard';
import { GiftsCard } from '@/features/calendar/GiftsCard';
import { ProposalCard } from '@/features/calendar/ProposalCard';
import { ShareSuggestionCard } from '@/features/calendar/ShareSuggestionCard';
import { SearchResultCard, TravelResultCard, WeatherResultCard } from '@/features/integrations/IntegrationCards';

export type CardProps = {
  card: CardKind;
  onRespondRequest?: (accept: boolean) => void;
  onAnswerNotification?: (buttonId: string) => void;
  /** The resolved notification doc for a `{ kind: 'notification' }` card (loaded via `notifications.get` —
   * the card itself only carries an id, CONTRACT §3). Undefined while it's still loading. */
  notification?: NotificationDoc;
  /** G3 review fix (HIGH, reminder card title): the MEGA's name already shown in the chat header
   * (ChatHeader.tsx) — a notification card hides its own `title` when it's just that same name again
   * (legacy rows backfilled before the backend sent a real headline). */
  megaName?: string;
};

const scopeLabel = { family: 'Family', adults: 'Adults', personal: 'Only me', shared: 'Shared' } as const;

// `requests.respond` isn't wired to a notification lookup, so a bare `{ kind: 'request' }` card (never
// actually emitted by the backend today, see requests.ts — kept for CONTRACT §3 completeness) renders
// its buttons straight from config instead of a doc, in the same order a real request's notification
// would carry them (G1 fix #3: this used to hardcode "I can't" before "Yes", the reverse of BUTTON_SETS).
const REQUEST_BUTTONS = BUTTON_SETS['request.default'];

export function ResultCard({ card, onRespondRequest, onAnswerNotification, notification, megaName }: CardProps) {
  const tokens = useTokens();
  const visibleTo = 'visibleTo' in card ? <VisibleTo scope={card.visibleTo} /> : null;

  switch (card.kind) {
    case 'event':
      return (
        <Card>
          <Text variant="label">Event saved</Text>
          {visibleTo}
        </Card>
      );
    case 'reminder':
      return (
        <Card>
          <Text variant="label">Reminder set</Text>
          {visibleTo}
        </Card>
      );
    case 'list':
      return (
        <Card>
          <Text variant="label">List updated</Text>
          {card.added && card.added.length > 0 && <Text color="muted">Added: {card.added.join(', ')}</Text>}
          {visibleTo}
        </Card>
      );
    case 'search':
      return <SearchResultCard card={card} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'weather':
      return <WeatherResultCard card={card} />;
    case 'travel':
      return <TravelResultCard card={card} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'request':
      return (
        <Card>
          <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
            A request is waiting on you
          </Text>
          <ButtonRow buttons={REQUEST_BUTTONS} onPress={(buttonId) => onRespondRequest?.(buttonId === 'yes')} />
        </Card>
      );
    case 'notification':
      return <NotificationCard notification={notification} onAnswerNotification={onAnswerNotification} megaName={megaName} />;
    case 'homework':
      return <HomeworkCard sheetId={card.sheetId} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'practice':
      return <PracticeCard setId={card.setId} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'chore':
      return <ChoreCard claimId={card.claimId} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'routine':
      return <RoutineCard runId={card.runId} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'bucks':
      return <BucksCard ledgerId={card.ledgerId} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'shareSuggestion':
      return <ShareSuggestionCard suggestionId={card.suggestionId} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'proposal':
      return <ProposalCard proposalId={card.proposalId} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'gifts':
      return <GiftsCard giftIdeasId={card.giftIdeasId} megaName={megaName ?? GD_FALLBACK_FROM} />;
    case 'intro':
      return <IntroCard megaName={megaName ?? GD_FALLBACK_FROM} />;
    default:
      return null;
  }
}

/** The "from" line when a GD card's MEGA isn't known (a message whose author has no directory entry). */
const GD_FALLBACK_FROM = 'MEGA';

function VisibleTo({ scope }: { scope: keyof typeof scopeLabel }) {
  return (
    <Text variant="caption" color="muted">
      Visible to {scopeLabel[scope]}
    </Text>
  );
}

/** G1 fix: the card used to show only the word "Notification" — a `{ kind: 'notification' }` card only
 * ever carried an id, with nothing to render. Shows the real title and body (for a request's own
 * notification, `title` is already "<MEGA> asks", seed.ts — so this also covers "present it as the
 * request" without a second lookup) and its buttons, in the order stored on the notification (BUTTON_SETS
 * order, G1 fix #3, via the shared ButtonRow). Once answered, the buttons are replaced by the answer —
 * same collapse pattern as an answered thread block (Blocks.tsx's AnsweredBlock). */
/** G3 review fix (HIGH, reminder card title): the backend now sends a real headline in
 * `notification.title` (CONTRACT §2) — rendered per the board as headline, then body. Never duplicates
 * the MEGA's name already shown in the chat header (ChatHeader.tsx): a legacy row whose `title` is just
 * that same name again (backfilled before this change) hides the title line rather than showing the
 * name twice on screen at once. Trimmed, case-sensitive-on-the-rest comparison — the exact string the
 * backend used to send, not a loose match. */
function shouldShowNotificationTitle(title: string, megaName: string | undefined): boolean {
  if (!title.trim()) return false;
  if (!megaName) return true;
  return title.trim() !== megaName.trim();
}

function NotificationCard({ notification, onAnswerNotification, megaName }: { notification?: NotificationDoc; onAnswerNotification?: (buttonId: string) => void; megaName?: string }) {
  const tokens = useTokens();
  if (!notification) return <CardSkeleton from={megaName ?? ''} label={KIDS_COPY.loadingLabel} />;
  const answer = notification.answer;
  const answeredLabel = answer ? notification.buttons.find((b) => b.id === answer.buttonId)?.label : undefined;
  const showTitle = shouldShowNotificationTitle(notification.title, megaName);
  return (
    <Card>
      {showTitle && (
        <Text variant="label" style={{ marginBottom: tokens.spacing.xs }}>
          {notification.title}
        </Text>
      )}
      <Text color="muted" style={{ marginBottom: tokens.spacing.sm }}>
        {notification.body}
      </Text>
      {notification.heldUntil != null && <HeldNotice createdAt={notification._creationTime} />}
      {answer ? (
        <Text style={{ color: tokens.muted, fontStyle: 'italic' }} accessibilityLabel={`Answered: ${notification.reply ?? answeredLabel ?? 'Answered'}`}>
          {notification.reply ?? answeredLabel ?? 'Answered'}
        </Text>
      ) : (
        <ButtonRow buttons={notification.buttons} onPress={(buttonId) => onAnswerNotification?.(buttonId)} />
      )}
    </Card>
  );
}

/** PLAN §6 / design board (Push.template.html "held" row): "Anything due during quiet hours is held and
 * sent when they end" — shown on the board as "Saved from 9:10 PM · quiet hours". `heldUntil` (CONTRACT
 * §2, `notifications.heldUntil`) is *when quiet hours end and the held notification actually sends* —
 * the moment the board's text is about is when it was first due, which for a held notification is when
 * the row itself was created (`_creationTime`), so that's what's formatted here. Frontend assumption for
 * the backend to confirm (see the G3 report): a notification only ever carries `heldUntil` while it was
 * (or still is) held for quiet hours. */
export function HeldNotice({ createdAt }: { createdAt: number }) {
  const tokens = useTokens();
  const time = new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <Text variant="caption" color="muted" style={{ marginBottom: tokens.spacing.sm, fontStyle: 'italic' }}>
      Saved from {time} · quiet hours
    </Text>
  );
}
