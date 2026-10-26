// Today sheet (PLAN §1 Today button, CONTRACT today.get): events, waiting on you, lists, and the
// MEGA statement. Presentational — driven by the today.get query in the route.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Infer } from 'convex/values';
import type { API } from '@shared/domain/api';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type Today = Infer<(typeof API)['today']['get']['returns']>;

export type TodayContentProps = {
  today: Today;
  onRespondRequest: (requestId: string, accept: boolean) => void;
  onAnswerNotification: (notificationId: string, buttonId: string) => void;
};

export function TodayContent({ today, onRespondRequest, onAnswerNotification }: TodayContentProps) {
  const tokens = useTokens();
  return (
    <>
      {today.statement && (
        <Card>
          <Text variant="label" style={{ marginBottom: tokens.spacing.xs }}>
            From your MEGA
          </Text>
          <Text>{today.statement.text}</Text>
        </Card>
      )}

      <Section title="Events today">
        {today.events.length === 0 ? (
          <Text color="muted">No events today.</Text>
        ) : (
          today.events.map((e) => (
            <Card key={e._id} style={{ marginBottom: tokens.spacing.sm }}>
              <Text variant="label">{e.title}</Text>
              <Text color="muted">{new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
            </Card>
          ))
        )}
      </Section>

      <Section title="Waiting on you">
        {today.waitingOnYou.length === 0 ? (
          <Text color="muted">Nothing waiting on you.</Text>
        ) : (
          today.waitingOnYou.map((w) =>
            w.kind === 'request' ? (
              <Card key={w.request._id} style={{ marginBottom: tokens.spacing.sm }}>
                <Text style={{ marginBottom: tokens.spacing.sm }}>{w.request.text}</Text>
                <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
                  <Button label="I can't" variant="secondary" onPress={() => onRespondRequest(w.request._id, false)} />
                  <Button label="Yes" onPress={() => onRespondRequest(w.request._id, true)} />
                </View>
              </Card>
            ) : (
              <Card key={w.notification._id} style={{ marginBottom: tokens.spacing.sm }}>
                <Text variant="label">{w.notification.title}</Text>
                <Text color="muted" style={{ marginBottom: tokens.spacing.sm }}>
                  {w.notification.body}
                </Text>
                <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, flexWrap: 'wrap' }}>
                  {w.notification.buttons.map((b) => (
                    <Chip key={b.id} label={b.label} onPress={() => onAnswerNotification(w.notification._id, b.id)} />
                  ))}
                </View>
              </Card>
            ),
          )
        )}
      </Section>

      <Section title="Lists">
        {today.lists.length === 0 ? (
          <Text color="muted">No lists yet.</Text>
        ) : (
          today.lists.map((l) => (
            <Card key={l.list._id} style={{ marginBottom: tokens.spacing.sm }}>
              <Text variant="label">
                {l.list.name} · {l.open} open
              </Text>
            </Card>
          ))
        )}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const tokens = useTokens();
  return (
    <View style={{ marginBottom: tokens.spacing.lg }}>
      <Text variant="label" color="muted" style={{ marginBottom: tokens.spacing.sm }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}
