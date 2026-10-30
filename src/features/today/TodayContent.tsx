// Today sheet (PLAN §1 Today button, CONTRACT today.get): events, waiting on you, lists, and the
// MEGA statement. Presentational — driven by the today.get query in the route.
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { Infer } from 'convex/values';
import type { API } from '@shared/domain/api';
import { BUTTON_SETS } from '@shared/config/notifications';
import { ButtonRow } from '@/ui/ButtonRow';
import { Glyph } from '@/features/integrations/glyphs';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';
import { HeldNotice } from '@/features/chat/Cards';
import { errorCopyFor } from '@/data/errorCopy';

export type Today = Infer<(typeof API)['today']['get']['returns']>;

// A bare `request` entry (no notification doc attached) renders its buttons straight from config, in
// the same order its own notification would carry them (G1 fix #3: this used to hardcode "I can't"
// before "Yes" — the reverse of BUTTON_SETS).
const REQUEST_BUTTONS = BUTTON_SETS['request.default'];

export type TodayContentProps = {
  today: Today;
  onRespondRequest: (requestId: string, accept: boolean) => Promise<unknown> | void;
  onAnswerNotification: (notificationId: string, buttonId: string) => Promise<unknown> | void;
  onOpenCalendar?: () => void;
  onOpenLists?: () => void;
  timezone?: string;
};

export function TodayContent({ today, onRespondRequest, onAnswerNotification, onOpenCalendar, onOpenLists, timezone }: TodayContentProps) {
  const tokens = useTokens();
  const [busy, setBusy] = useState<{ id: string; button: string } | null>(null);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (id: string, button: string, action: () => Promise<unknown> | void) => {
    if (running.current) return;
    running.current = true; setBusy({ id, button }); setError(null);
    try { await action(); }
    catch (err) { setError(errorCopyFor(err)); }
    finally { running.current = false; setBusy(null); }
  };
  return (
    <>
      <View style={{ gap: tokens.spacing.xs, paddingBottom: tokens.spacing.sm }}>
        <Text color="muted">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone })}</Text>
        <Text variant="title">{today.waitingOnYou.length ? `${today.waitingOnYou.length} ${today.waitingOnYou.length === 1 ? 'thing needs' : 'things need'} your answer` : 'You’re all caught up'}</Text>
        <Text variant="caption" color="muted">{today.events.length} upcoming {today.events.length === 1 ? 'event' : 'events'} · {today.lists.reduce((count, list) => count + list.open, 0)} open list items</Text>
      </View>
      {today.waitingOnYou.length > 0 ? (
      <Section title="Waiting on you">
        {error ? <Text accessibilityRole="alert" style={{ color: tokens.danger, marginBottom: tokens.spacing.sm }}>{error}</Text> : null}
        {today.waitingOnYou.length === 0 ? (
          <Text color="muted">Nothing waiting on you.</Text>
        ) : (
          today.waitingOnYou.map((w) =>
            w.kind === 'request' ? (
              <Card key={w.request._id} style={{ marginBottom: tokens.spacing.sm }}>
                <Text style={{ marginBottom: tokens.spacing.sm }}>{w.request.text}</Text>
                <ButtonRow buttons={REQUEST_BUTTONS} disabled={!!busy} loadingButtonId={busy?.id === w.request._id ? busy.button : undefined} onPress={(buttonId) => { void answer(w.request._id, buttonId, () => onRespondRequest(w.request._id, buttonId === 'yes')); }} />
              </Card>
            ) : (
              <Card key={w.notification._id} style={{ marginBottom: tokens.spacing.sm }}>
                <Text variant="label">{w.notification.title}</Text>
                <Text color="muted" style={{ marginBottom: tokens.spacing.sm }}>
                  {w.notification.body}
                </Text>
                {w.notification.heldUntil != null && <HeldNotice createdAt={w.notification._creationTime} />}
                <ButtonRow buttons={w.notification.buttons} disabled={!!busy} loadingButtonId={busy?.id === w.notification._id ? busy.button : undefined} onPress={(buttonId) => { void answer(w.notification._id, buttonId, () => onAnswerNotification(w.notification._id, buttonId)); }} />
              </Card>
            ),
          )
        )}
      </Section>

      ) : null}
      <Section title="Your day">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {today.events.length === 0 ? <Text color="muted" style={{ padding: tokens.spacing.md }}>No more events today. A little breathing room.</Text> : today.events.map((event, index) => (
            <Pressable key={event._id} onPress={onOpenCalendar} disabled={!onOpenCalendar} accessibilityRole={onOpenCalendar ? 'button' : undefined} accessibilityLabel={`Open calendar: ${event.title}`} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.md, borderTopWidth: index ? 1 : 0, borderTopColor: tokens.line }}>
              <Text variant="caption" color="muted" style={{ width: 64 }}>{new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: timezone })}</Text>
              <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: tokens.accent, borderRadius: 2 }} />
              <Text variant="label" style={{ flex: 1 }}>{event.title}</Text>
              {onOpenCalendar ? <Glyph name="chevron" color={tokens.muted} /> : null}
            </Pressable>
          ))}
          {onOpenCalendar ? <Pressable accessibilityRole="button" onPress={onOpenCalendar} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: tokens.spacing.md, borderTopWidth: 1, borderTopColor: tokens.line }}><Text color="accent">Open calendar</Text></Pressable> : null}
        </Card>
      </Section>
      <Section title="Lists">
        {today.lists.length === 0 ? (
          <Pressable onPress={onOpenLists} disabled={!onOpenLists} accessibilityRole={onOpenLists ? 'button' : undefined} style={{ minHeight: tokens.touchTarget, justifyContent: 'center' }}><Text color={onOpenLists ? 'accent' : 'muted'}>{onOpenLists ? 'Create your first list' : 'No lists yet.'}</Text></Pressable>
        ) : (
          today.lists.map((l) => (
            <Pressable key={l.list._id} onPress={onOpenLists} disabled={!onOpenLists} accessibilityRole={onOpenLists ? 'button' : undefined} accessibilityLabel={`Open list: ${l.list.name}`}><Card style={{ marginBottom: tokens.spacing.sm, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
              <Glyph name="check" color={tokens.accent} /><Text style={{ flex: 1 }}>{l.list.name}</Text><Text variant="caption" color="muted">{l.open} open</Text><Glyph name="chevron" color={tokens.muted} />
            </Card></Pressable>
          ))
        )}
      </Section>
      {today.statement ? <View style={{ borderLeftWidth: 2, borderLeftColor: tokens.accent, paddingLeft: tokens.spacing.md, gap: tokens.spacing.xs }}><Text variant="caption" color="muted">FOR YOUR INFORMATION</Text><Text>{today.statement.text}</Text></View> : null}
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
