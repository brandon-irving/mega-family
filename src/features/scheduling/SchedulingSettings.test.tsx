import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/ui/theme';
import { SchedulingSetup } from './SchedulingSettings';
import { useSchedulingActions } from '@/data/useScheduling';
import { useAccountActions } from '@/data/useAccounts';
import { connectGoogle } from '@/services/googleConnect';
jest.mock('@/data/useScheduling');
jest.mock('@/data/useAccounts');
jest.mock('@/services/googleConnect');
const base = { enabled: false, autoCapture: false, availabilityFor: [], people: [{ id: 'dad' as never, name: 'Brandon', sharesWithMe: false }], canWriteCalendar: false, canWriteDraft: false, gmailConnected: false, calendarConnected: false, detection: 'disconnected' as const };
const setSharing = jest.fn().mockResolvedValue(null);
const setPreferences = jest.fn().mockResolvedValue(null);
const accountActions = {} as ReturnType<typeof useAccountActions>;
beforeEach(() => {
 jest.clearAllMocks();
 jest.mocked(useSchedulingActions).mockReturnValue({ setPreferences, setSharing } as unknown as ReturnType<typeof useSchedulingActions>);
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
 expect(setPreferences).toHaveBeenCalledWith({ enabled: true, autoCapture: true, availabilityFor: ['dad'], availabilitySharing: 'family', desiredWrites: true });
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

test('configured sharing saves immediately without saving other draft settings or reconnecting', async () => {
 const preferences = { ...base, configured: true, enabled: true, gmailConnected: true, calendarConnected: true, canWriteCalendar: true, canWriteDraft: true };
 const rendered = await renderWithTheme(<SchedulingSetup preferences={preferences} />);
 await fireEvent(screen.getByLabelText('Add confirmed events automatically'), 'valueChange', true);
 await fireEvent.press(screen.getByRole('button', { name: 'Family coordination' }));
 await waitFor(() => expect(setSharing).toHaveBeenCalledWith({ availabilityFor: ['dad'], availabilitySharing: 'family' }));
 expect(setPreferences).not.toHaveBeenCalled();
 expect(connectGoogle).not.toHaveBeenCalled();
 expect(screen.getByText('Sharing saved.')).toBeTruthy();
 await rendered.rerender(<ThemeProvider initialRole="adult"><SchedulingSetup preferences={{ ...preferences, availabilitySharing: 'family', availabilityFor: ['dad' as never] }} /></ThemeProvider>);
 expect(screen.getByRole('button', { name: 'Selected · Family coordination' })).toBeTruthy();
});

test('failed sharing save keeps the saved selection and reports an error', async () => {
 setSharing.mockRejectedValueOnce(new Error('Offline'));
 await renderWithTheme(<SchedulingSetup preferences={{ ...base, configured: true }} />);
 await fireEvent.press(screen.getByRole('button', { name: 'Family coordination' }));
 await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
 expect(screen.getByRole('button', { name: 'Selected · Private' })).toBeTruthy();
 expect(screen.queryByText('Sharing saved.')).toBeNull();
});

test('Family can be saved before anyone joins and remains selected after reopening', async () => {
 const preferences = { ...base, configured: true, people: [] };
 const rendered = await renderWithTheme(<SchedulingSetup preferences={preferences} />);
 expect(screen.getByRole('button', { name: 'Family coordination' })).toBeEnabled();
 expect(screen.getByRole('button', { name: 'Choose people' })).toBeDisabled();
 await fireEvent.press(screen.getByRole('button', { name: 'Family coordination' }));
 await waitFor(() => expect(setSharing).toHaveBeenCalledWith({ availabilityFor: [], availabilitySharing: 'family' }));
 await rendered.unmount();
 await renderWithTheme(<SchedulingSetup preferences={{ ...preferences, availabilitySharing: 'family' }} />);
 expect(screen.getByRole('button', { name: 'Selected · Family coordination' })).toBeTruthy();
 expect(screen.getByText(/Availability will be shared when you add/)).toBeTruthy();
 await fireEvent.press(screen.getByRole('button', { name: 'Private' }));
 await waitFor(() => expect(setSharing).toHaveBeenLastCalledWith({ availabilityFor: [], availabilitySharing: 'private' }));
});

test('first Google setup preserves Family with an empty household', async () => {
 await renderWithTheme(<SchedulingSetup preferences={{ ...base, people: [] }} />);
 await fireEvent.press(screen.getByRole('button', { name: 'Family coordination' }));
 await fireEvent.press(screen.getByRole('button', { name: 'Connect Google' }));
 await waitFor(() => expect(setPreferences).toHaveBeenCalledWith(expect.objectContaining({ availabilityFor: [], availabilitySharing: 'family' })));
});
