import { useState } from 'react';
import { View } from 'react-native';
import type { Id } from '@shared/domain/validators';
import type { PlanView, TimeSlot } from '@shared/domain/scheduling';
import { SCHEDULING_COPY as C } from '@shared/config/scheduling';
import { formatLocalDateTime, formatLocalTime } from '@shared/time';
import { useMailPlan, useSchedulingActions } from '@/data/useScheduling';
import { useRunAction } from '@/features/shell/useRunAction';
import { router } from '@/features/shell/navigation';
import { CardFallback } from '@/features/kids/CardFallback';
import { openLink } from '@/services/openLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ModalSheet } from '@/ui/ModalSheet';
import { Text } from '@/ui/Text';
import { useTokens } from '@/ui/theme';

export function MailPlanCardView({ plan, busy, error, onHold, onDraft, onRefresh, onDismiss, onSyncCalendar, onReply }: { onReply?: () => void; plan: PlanView; busy: string | null; error: string | null; onHold: (s: TimeSlot) => void; onDraft: () => void; onRefresh: () => void; onDismiss: () => void; onSyncCalendar: () => void }) {
  const tokens = useTokens();
  const [chosen, setChosen] = useState<TimeSlot | null>(null);
  const [reviewCancel, setReviewCancel] = useState(false);
  const [reviewDraft, setReviewDraft] = useState(false);
  const [reviewCalendar, setReviewCalendar] = useState(false);
  const offeredChoice = !!plan.selectionConfirms && !!chosen && plan.slots.some(s => !s.alternative && s.start === chosen.start && s.end === chosen.end);
  const closed = plan.status === 'cancelled' || plan.status === 'dismissed';
  const choosing = !closed && (plan.status === 'proposed' || plan.status === 'review');
  const describe = (s: TimeSlot) => `${formatLocalDateTime(s.start, plan.timezone)}–${formatLocalTime(s.end, plan.timezone)}`;
  const uncertain = plan.calendarOperation === 'uncertain' || plan.draftOperation === 'uncertain';
  return <Card>
    <View style={{ gap: tokens.spacing.md }}>
      <Text variant="label">{plan.title}</Text>
      <Text color="muted">{C.status[plan.status]}{plan.status === 'confirmed' && plan.eventId && plan.calendarOperation !== 'uncertain' && plan.calendarOperation !== 'running' ? ' · On your calendar' : ''}</Text>
      {plan.guidance ? <Text>{plan.guidance}</Text> : null}
      {plan.selected ? <Text>{describe(plan.selected)}</Text> : null}
      {plan.participantNames.length > 1 ? <Text variant="caption" color="muted">Checking: {plan.participantNames.join(', ')}</Text> : null}
      {plan.missing.map((s, i) => <Text key={i} color="muted">{s}</Text>)}
      {plan.unavailableNames.length && choosing && !plan.guidance ? <Text color="muted">Availability needs checking: {plan.unavailableNames.join(', ')}. {C.unavailable}</Text> : null}
      {plan.durationAssumed && choosing ? <Text color="muted">Duration is estimated. Confirm it with the sender before finalizing.</Text> : null}
      {choosing ? plan.slots.map(s => <Button key={`${s.start}-${s.end}`} label={`${describe(s)} · ${!s.checked ? 'Not checked' : s.available ? s.alternative ? 'Another option' : 'Available' : 'Unavailable'}`} variant="secondary" disabled={!!busy || !s.available || plan.calendarOperation === 'running'} onPress={() => setChosen(s)} />) : null}
      {choosing && plan.slots.length > 0 && plan.slots.every(s => s.checked && !s.available) ? <Text color="muted">{C.noSlots}</Text> : null}
      {plan.canSendReply && plan.replyOperation !== 'done' ? <Button label="Reply with this time" disabled={!!busy || plan.replyOperation === 'running' || plan.replyOperation === 'uncertain'} onPress={onReply} /> : null}
      {plan.replyOperation === 'done' ? <Text>{plan.status === 'confirmed' ? 'Reply sent to the organizer' : 'Reply sent · waiting for the organizer'}</Text> : null}
      {plan.replyOperation === 'uncertain' ? <Text>Delivery is uncertain. Check Gmail Sent before doing anything else; MEGA will not send again automatically.</Text> : null}
      {plan.replyOperation === 'failed' ? <Text>The reply was not sent. Review it and try again.</Text> : null}
      {plan.status === 'held' ? <Text color="muted">{plan.confirmationText ?? C.held}</Text> : null}
      {plan.draftOperation === 'done' ? <Text>{plan.status === 'held' ? C.draftSaved : 'An earlier reply draft is in Gmail. Review it against this update.'}</Text> : null}
      {uncertain ? <Text color="muted">{C.uncertain}</Text> : null}
      {plan.calendarOperation === 'running' || plan.draftOperation === 'running' ? <Text accessibilityLiveRegion="polite">Saving to your connected account…</Text> : null}
      {plan.calendarOperation === 'failed' || plan.draftOperation === 'failed' ? <Text color="muted">The connected app could not save this. Check your connection and try again.</Text> : null}
      {plan.calendarOperation === 'uncertain' && (plan.status === 'confirmed' || plan.status === 'cancelled') ? <Button label={C.syncCalendar} disabled={!!busy || !plan.canWriteCalendar} onPress={() => setReviewCalendar(true)} /> : null}
      {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
      {choosing ? <Button label={C.refresh} variant="ghost" disabled={!!busy} loading={busy === 'refresh'} onPress={onRefresh} /> : null}
      {plan.status === 'held' && plan.draftOperation !== 'done' && plan.draftOperation !== 'uncertain' ? <Button label={C.draft} disabled={!!busy || plan.draftOperation === 'running' || !plan.canWriteDraft} loading={busy === 'draft'} onPress={() => setReviewDraft(true)} /> : null}
      {(!plan.canWriteCalendar || !plan.canWriteDraft) && !closed ? <Button label={C.settings} variant="ghost" onPress={() => router.push('/scheduling')} /> : null}
      <Button label={C.openMail} variant="ghost" onPress={() => void openLink(plan.sourceUrl).catch(() => undefined)} />
      {!closed ? <Button label={plan.selected && plan.eventId ? 'Cancel calendar hold' : plan.canUndo ? C.undo : C.dismiss} variant="ghost" disabled={!!busy || plan.calendarOperation === 'running' || plan.draftOperation === 'running'} onPress={() => plan.selected && plan.eventId ? setReviewCancel(true) : onDismiss()} /> : null}
      <Text variant="caption" color="muted">{C.private}</Text>
    </View>
    <ModalSheet open={reviewCancel} title="Cancel this calendar hold?" onClose={() => setReviewCancel(false)} closeLabel="Close">
      <Text>This cancels the event MEGA created on your calendar and closes its confirmation request. No email is sent.</Text>
      <Button label="Cancel calendar hold" onPress={() => { onDismiss(); setReviewCancel(false); }} />
    </ModalSheet>
    <ModalSheet open={reviewDraft} title="Review reply draft" onClose={() => setReviewDraft(false)} closeLabel="Close">
      <View style={{ gap: tokens.spacing.md }}><Text color="muted">Reply to {plan.sourceLabel}. The draft will be saved in the email thread for you to review and send.</Text><Text>{plan.replyText}</Text>
        <Button label={C.draft} disabled={!!busy} onPress={() => { onDraft(); setReviewDraft(false); }} /></View>
    </ModalSheet>
    <ModalSheet open={reviewCalendar} title="Update your calendar?" onClose={() => setReviewCalendar(false)} closeLabel="Close">
      <View style={{ gap: tokens.spacing.md }}><Text>{plan.status === 'cancelled' ? 'Cancel this event on Google Calendar.' : plan.selected ? describe(plan.selected) : plan.title}</Text><Text color="muted">This updates only the event MEGA created on your calendar. No invitations are sent.</Text>
        <Button label={C.syncCalendar} disabled={!!busy} onPress={() => { onSyncCalendar(); setReviewCalendar(false); }} /></View>
    </ModalSheet>
    <ModalSheet open={!!chosen} title={offeredChoice ? "Choose this time?" : "Hold this time?"} onClose={() => setChosen(null)} closeLabel="Close">
      {chosen ? <View style={{ gap: tokens.spacing.md }}>
        <Text>{describe(chosen)}</Text><Text color="muted">{offeredChoice ? C.offeredReview : 'This creates a tentative event on your Google Calendar. Named family participants will receive a request to confirm this title and time in MEGA. No email is sent.'}</Text>
        <Button label={plan.canWriteCalendar ? offeredChoice ? C.choose : C.hold : C.authorize} disabled={!!busy} onPress={() => { if (!plan.canWriteCalendar) { setChosen(null); router.push('/scheduling'); } else { onHold(chosen); setChosen(null); } }} />
      </View> : null}
    </ModalSheet>
  </Card>;
}
export function MailPlanCard({ planId }: { planId: Id<'mailPlans'> }) {
  const state = useMailPlan(planId);
  const actions = useSchedulingActions();
  const [reply, setReply] = useState<{ to: string; subject: string; body: string; revision: number } | null>(null);
  const { busy, error, run } = useRunAction();
  if (state.status !== 'ok') return <CardFallback state={state} from="Email & scheduling" />;
  const plan = state.data;
  return <><MailPlanCardView onReply={() => void run('previewReply', async () => setReply({ ...await actions.previewReply({ planId, revision: plan.revision }), revision: plan.revision }))} plan={plan} busy={busy} error={error}
    onSyncCalendar={() => void run('calendar', () => actions.syncCalendar({ planId, revision: plan.revision }))}
    onHold={({ start, end }) => void run('hold', () => actions.hold({ planId, revision: plan.revision, start, end }))}
    onDraft={() => void run('draft', () => actions.draft({ planId, revision: plan.revision }))}
    onRefresh={() => void run('refresh', () => actions.refresh({ planId }))}
    onDismiss={() => void run('dismiss', () => actions.dismiss({ planId }))} />
    <ModalSheet open={!!reply} title="Review email reply" onClose={() => { if (!busy) setReply(null); }} closeLabel="Close">
      {reply ? <><Text>To: {reply.to}</Text><Text>Subject: {reply.subject}</Text><Text>{reply.body}</Text>
        <Button label="Send email" disabled={!!busy} loading={busy === 'sendReply'} onPress={() => void run('sendReply', async () => { await actions.sendReply({ planId, ...reply }); setReply(null); })} />
      </> : null}
    </ModalSheet></>;

}
