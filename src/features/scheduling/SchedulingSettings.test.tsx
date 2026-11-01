import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SchedulingSetup } from './SchedulingSettings';
import { useSchedulingActions } from '@/data/useScheduling';
import { useAccountActions } from '@/data/useAccounts';
import { connectGoogle } from '@/services/googleConnect';
jest.mock('@/data/useScheduling');
jest.mock('@/data/useAccounts');
jest.mock('@/services/googleConnect');
const base = { enabled: false, autoCapture: false, availabilityFor: [], people: [{ id: 'dad' as never, name: 'Brandon', sharesWithMe: false }], canWriteCalendar: false, canWriteDraft: false, gmailConnected: false, calendarConnected: false, detection: 'disconnected' as const };
const setPreferences = jest.fn().mockResolvedValue(null);
const accountActions = {} as ReturnType<typeof useAccountActions>;
beforeEach(() => {
 jest.clearAllMocks();
 jest.mocked(useSchedulingActions).mockReturnValue({ setPreferences } as unknown as ReturnType<typeof useSchedulingActions>);
 jest.mocked(useAccountActions).mockReturnValue(accountActions);
 jest.mocked(connectGoogle).mockResolvedValue('connected');
});
test('one reviewed setup connects both Google services with holds and drafts and chosen family sharing', async () => {
 await renderWithTheme(<SchedulingSetup preferences={base} />);
 await fireEvent.press(screen.getByRole('button', { name: 'Family coordination' }));
 await fireEvent(screen.getByLabelText('Add confirmed events automatically'), 'valueChange', true);
 await fireEvent.press(screen.getByRole('button', { name: 'Connect Google' }));
 await waitFor(() => expect(connectGoogle).toHaveBeenCalledWith(['gmail','googleCalendar'], accountActions, true));
 expect(connectGoogle).toHaveBeenCalledTimes(1);
 expect(setPreferences).toHaveBeenCalledWith({ enabled: true, autoCapture: true, availabilityFor: ['dad'], desiredWrites: true });
});
test('private read-only setup requests no write capabilities', async () => {
 await renderWithTheme(<SchedulingSetup preferences={base} />);
 await fireEvent(screen.getByLabelText('Calendar holds & reply drafts'), 'valueChange', false);
 await fireEvent.press(screen.getByRole('button', { name: 'Connect Google' }));
 await waitFor(() => expect(connectGoogle).toHaveBeenCalledWith(['gmail','googleCalendar'], accountActions, false));
 expect(setPreferences).toHaveBeenCalledWith(expect.objectContaining({ availabilityFor: [] }));
});
test('existing full authorization saves settings without another Google prompt', async () => {
 await renderWithTheme(<SchedulingSetup preferences={{ ...base, gmailConnected: true, calendarConnected: true, canWriteCalendar: true, canWriteDraft: true }} />);
 await fireEvent.press(screen.getByRole('button', { name: 'Save choices' }));
 await waitFor(() => expect(setPreferences).toHaveBeenCalled());
 expect(connectGoogle).not.toHaveBeenCalled();
});
test('partial Google approval is shown separately instead of reporting everything connected', async () => {
 await renderWithTheme(<SchedulingSetup preferences={{ ...base, gmailConnected: true }} />);
 expect(screen.getByText(/Calendar · Not connected/)).toBeTruthy();
 expect(screen.getByRole('button', { name: 'Connect Google' })).toBeTruthy();
});
