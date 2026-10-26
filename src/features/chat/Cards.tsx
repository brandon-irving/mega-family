// Renders every result Card kind (CONTRACT §3): event, reminder, list, search, weather, travel,
// request and notification. Pure presentational — the "visibleTo" scope line is shared by the kinds
// that carry one.
import { View } from 'react-native';
import type { Card as CardKind } from '@shared/domain/messages';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type CardProps = {
  card: CardKind;
  onRespondRequest?: (accept: boolean) => void;
  onAnswerNotification?: (buttonId: string) => void;
  notificationButtons?: { id: string; label: string }[];
};

const scopeLabel = { family: 'Family', adults: 'Adults', personal: 'Only me', shared: 'Shared' } as const;

export function ResultCard({ card, onRespondRequest, onAnswerNotification, notificationButtons }: CardProps) {
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
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
            <Button label="I can't" variant="secondary" onPress={() => onRespondRequest?.(false)} />
            <Button label="Yes" onPress={() => onRespondRequest?.(true)} />
          </View>
        </Card>
      );
    case 'notification':
      return (
        <Card>
          <Text variant="label" style={{ marginBottom: tokens.spacing.sm }}>
            Notification
          </Text>
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, flexWrap: 'wrap' }}>
            {(notificationButtons ?? []).map((b) => (
              <Button key={b.id} label={b.label} variant="secondary" onPress={() => onAnswerNotification?.(b.id)} />
            ))}
          </View>
        </Card>
      );
  }
}

function VisibleTo({ scope }: { scope: keyof typeof scopeLabel }) {
  return (
    <Text variant="caption" color="muted">
      Visible to {scopeLabel[scope]}
    </Text>
  );
}
