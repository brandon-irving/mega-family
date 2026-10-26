// Today sheet (PLAN §1 Today button, CONTRACT today.get): events, waiting on you, lists, and the
// MEGA statement. Presentational — driven by the today.get query in the route.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Infer } from 'convex/values';
import type { API } from '@shared/domain/api';
import { BUTTON_SETS } from '@shared/config/notifications';
import { ButtonRow } from '@/ui/ButtonRow';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export type Today = Infer<(typeof API)['today']['get']['returns']>;

// A bare `request` entry (no notification doc attached) renders its buttons straight from config, in
// the same order its own notification would carry them (G1 fix #3: this used to hardcode "I can't"
// before "Yes" — the reverse of BUTTON_SETS).
const REQUEST_BUTTONS = BUTTON_SETS['request.default'];

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
                <ButtonRow buttons={REQUEST_BUTTONS} onPress={(buttonId) => onRespondRequest(w.request._id, buttonId === 'yes')} />
              </Card>
            ) : (
              <Card key={w.notification._id} style={{ marginBottom: tokens.spacing.sm }}>
                <Text variant="label">{w.notification.title}</Text>
                <Text color="muted" style={{ marginBottom: tokens.spacing.sm }}>
                  {w.notification.body}
                </Text>
                <ButtonRow buttons={w.notification.buttons} onPress={(buttonId) => onAnswerNotification(w.notification._id, buttonId)} />
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
