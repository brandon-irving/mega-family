// Renders every result Card kind (CONTRACT §3): event, reminder, list, search, weather, travel,
// request and notification. Pure presentational — the "visibleTo" scope line is shared by the kinds
// that carry one.
import { View } from 'react-native';
import type { Card as CardKind } from '@shared/domain/messages';
import { BUTTON_SETS } from '@shared/config/notifications';
import type { NotificationDoc } from '@/data/useNotifications';
import { ButtonRow } from '@/ui/ButtonRow';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type CardProps = {
  card: CardKind;
  onRespondRequest?: (accept: boolean) => void;
  onAnswerNotification?: (buttonId: string) => void;
  /** The resolved notification doc for a `{ kind: 'notification' }` card (loaded via `notifications.get` —
   * the card itself only carries an id, CONTRACT §3). Undefined while it's still loading. */
  notification?: NotificationDoc;
};

const scopeLabel = { family: 'Family', adults: 'Adults', personal: 'Only me', shared: 'Shared' } as const;

// `requests.respond` isn't wired to a notification lookup, so a bare `{ kind: 'request' }` card (never
// actually emitted by the backend today, see requests.ts — kept for CONTRACT §3 completeness) renders
// its buttons straight from config instead of a doc, in the same order a real request's notification
// would carry them (G1 fix #3: this used to hardcode "I can't" before "Yes", the reverse of BUTTON_SETS).
const REQUEST_BUTTONS = BUTTON_SETS['request.default'];

export function ResultCard({ card, onRespondRequest, onAnswerNotification, notification }: CardProps) {
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
      return (
        <Card>
          <Text variant="label" style={{ marginBottom: tokens.spacing.xs }}>
            {card.query}
          </Text>
          <Text>{card.answer}</Text>
          {card.sources.length > 0 && (
            <View style={{ marginTop: tokens.spacing.sm, gap: tokens.spacing.xs }}>
              {card.sources.map((s) => (
                <Text key={s.url} variant="caption" color="muted">
                  {s.title}
                </Text>
              ))}
            </View>
          )}
        </Card>
      );
    case 'weather':
      return (
        <Card>
          <Text variant="label">Weather</Text>
          <Text color="muted">{card.summary}</Text>
        </Card>
      );
    case 'travel':
      return (
        <Card>
          <Text variant="label">Travel time</Text>
          <Text color="muted">
            To {card.to}: {card.minutes} min · leave by {new Date(card.leaveBy).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </Card>
      );
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
      return <NotificationCard notification={notification} onAnswerNotification={onAnswerNotification} />;
  }
}

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
function NotificationCard({ notification, onAnswerNotification }: { notification?: NotificationDoc; onAnswerNotification?: (buttonId: string) => void }) {
  const tokens = useTokens();
  if (!notification) {
    return (
      <Card>
        <Text color="muted">Loading…</Text>
      </Card>
    );
  }
  const answer = notification.answer;
  const answeredLabel = answer ? notification.buttons.find((b) => b.id === answer.buttonId)?.label : undefined;
  return (
    <Card>
      <Text variant="label" style={{ marginBottom: tokens.spacing.xs }}>
        {notification.title}
      </Text>
      <Text color="muted" style={{ marginBottom: tokens.spacing.sm }}>
        {notification.body}
      </Text>
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
