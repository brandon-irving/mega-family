import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { MailPlanCard, MailPlanCardView } from './MailPlanCard';
import { useMailPlan, useSchedulingActions } from '@/data/useScheduling';
import type { PlanView } from '@shared/domain/scheduling';
import { SCHEDULING_COPY as C } from '@shared/config/scheduling';
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@/features/shell/navigation', () => ({ router: { push: jest.fn() } }));
jest.mock('@/data/useScheduling');
const plan: PlanView = { id: 'plan' as never, title: 'Lunch', status: 'proposed', revision: 1, timezone: 'America/New_York', slots: [{ start: Date.UTC(2026, 9, 27, 16), end: Date.UTC(2026, 9, 27, 17), available: false, checked: true, alternative: false }, { start: Date.UTC(2026, 9, 27, 17, 30), end: Date.UTC(2026, 9, 27, 18, 30), available: true, checked: true, alternative: false }], participantNames: ['Brandon', 'Lovie'], unavailableNames: [], missing: [], durationAssumed: false, canUndo: false, sourceUrl: 'https://mail.google.com', sourceLabel: 'Library', canWriteCalendar: true, canWriteDraft: true };
const actions = () => ({ onHold: jest.fn(), onDraft: jest.fn(), onRefresh: jest.fn(), onDismiss: jest.fn(), onSyncCalendar: jest.fn() });
test('holding an alternative sends only the backend contract fields', async () => {
  const hold = jest.fn().mockResolvedValue(null);
  jest.mocked(useMailPlan).mockReturnValue({ status: 'ok', data: { ...plan, slots: plan.slots.map(s => ({ ...s, alternative: true })) } });
  jest.mocked(useSchedulingActions).mockReturnValue({ hold } as unknown as ReturnType<typeof useSchedulingActions>);
  await renderWithTheme(<MailPlanCard planId={plan.id} />);
  await fireEvent.press(screen.getByRole('button', { name: /1:30.*Another option/ }));
  expect(hold).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: C.hold }));
  await waitFor(() => expect(hold).toHaveBeenCalledWith({ planId: plan.id, revision: plan.revision, start: plan.slots[1].start, end: plan.slots[1].end }));
  expect(hold).toHaveBeenCalledTimes(1);
});
test('available time opens a review, then explicitly holds the selected slot', async () => {
  const on = actions();
  await renderWithTheme(<MailPlanCardView plan={plan} busy={null} error={null} {...on} />);
  await fireEvent.press(screen.getByRole('button', { name: /1:30.*Available/ }));
  expect(on.onHold).not.toHaveBeenCalled();
  expect(screen.getByText('Hold this time?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: C.hold }));
  expect(on.onHold).toHaveBeenCalledWith(expect.objectContaining({ start: plan.slots[1].start }));
});
test('uncertain availability cannot be selected and offers a refresh', async () => {
  const on = actions();
  await renderWithTheme(<MailPlanCardView plan={{ ...plan, slots: plan.slots.map(s => ({ ...s, available: false, checked: false })), unavailableNames: ['Brandon'] }} busy={null} error={null} {...on} />);
  await fireEvent.press(screen.getAllByRole('button', { name: /Not checked/ })[0]);
  expect(on.onHold).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: C.refresh }));
  expect(on.onRefresh).toHaveBeenCalledTimes(1);
});
test('draft preview is reviewed before creating anything and never offers send', async () => {
  const on = actions();
  await renderWithTheme(<MailPlanCardView plan={{ ...plan, status: 'held', selected: plan.slots[1], replyText: 'Would Tuesday at 1:30 work?' }} busy={null} error={null} {...on} />);
  await fireEvent.press(screen.getByRole('button', { name: C.draft }));
  expect(screen.getByText('Would Tuesday at 1:30 work?')).toBeTruthy();
  expect(on.onDraft).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  await fireEvent.press(screen.getAllByRole('button', { name: C.draft }).at(-1)!);
  expect(on.onDraft).toHaveBeenCalledTimes(1);
});

test('MEGA explains the conflict and alternative alongside the time choices', async () => {
  const guidance = 'Brandon is busy at noon, based on shared availability. 1:30 PM works with the calendars I could check.';
  await renderWithTheme(<MailPlanCardView plan={{ ...plan, guidance }} busy={null} error={null} {...actions()} />);
  expect(screen.getByText(guidance)).toBeTruthy();
});
