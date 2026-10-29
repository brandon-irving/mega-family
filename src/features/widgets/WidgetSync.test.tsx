// G8 (G8.md frontend task 1, invariants 3 and 9): the always-mounted component that keeps the widgets in step
// with `widgets.next` — on each change (throttled), on foreground (forced), and signed out the moment the
// viewer goes away or changes. expo-widgets is mocked so the writes can be read back.
import { act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { G8_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/ui/theme';
import { WIDGET_ADMIN_AFTERNOON, WIDGET_KID } from '@/test/g8Fixtures';
import { WidgetSync } from './WidgetSync';

// The widget objects are made inside the factory: `createWidget` runs when src/widgets/* is imported, which
// jest hoists above this file's own top-level code.
jest.mock('expo-widgets', () => {
  const widgets = { next: { updateTimeline: jest.fn(), updateSnapshot: jest.fn() }, talk: { updateTimeline: jest.fn(), updateSnapshot: jest.fn() } };
  return { createWidget: (name: string) => (name === 'MegaNext' ? widgets.next : widgets.talk), __widgets: widgets };
});
const { next: mockNext, talk: mockTalk } = (jest.requireMock('expo-widgets') as { __widgets: Record<'next' | 'talk', { updateTimeline: jest.Mock; updateSnapshot: jest.Mock }> }).__widgets;

let mockAuth: { status: 'loading' | 'signedIn' | 'signedOut' } = { status: 'signedIn' };
let mockViewer: { member: { _id: string } } | null | undefined = { member: { _id: 'm_admin' } };
let mockTimeline: typeof WIDGET_ADMIN_AFTERNOON | undefined = WIDGET_ADMIN_AFTERNOON;
jest.mock('@/services/auth', () => ({ useAuthState: () => mockAuth }));
jest.mock('@/data/useViewer', () => ({ useViewer: () => mockViewer }));
jest.mock('@/data/useWidgets', () => ({ useWidgetTimeline: (enabled: boolean) => (enabled ? mockTimeline : undefined) }));

let appStateListener: ((s: AppStateStatus) => void) | undefined;
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (s: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
  mockAuth = { status: 'signedIn' };
  mockViewer = { member: { _id: 'm_admin' } };
  mockTimeline = WIDGET_ADMIN_AFTERNOON;
  [mockNext.updateTimeline, mockNext.updateSnapshot, mockTalk.updateSnapshot].forEach((f) => f.mockClear());
});

const lastNextWrite = () => {
  const timeline = mockNext.updateTimeline.mock.invocationCallOrder.at(-1) ?? -1;
  const snapshot = mockNext.updateSnapshot.mock.invocationCallOrder.at(-1) ?? -1;
  return timeline > snapshot ? JSON.stringify(mockNext.updateTimeline.mock.calls.at(-1)) : JSON.stringify(mockNext.updateSnapshot.mock.calls.at(-1));
};

describe('WidgetSync', () => {
  test('signed in with a timeline: writes it to the widgets', async () => {
    await renderWithTheme(<WidgetSync />);
    expect(mockNext.updateTimeline).toHaveBeenCalledTimes(1);
    expect(lastNextWrite()).toContain('Dentist');
    expect(mockTalk.updateSnapshot).toHaveBeenCalled();
  });

  test('coming back to the foreground re-writes the widgets even inside the throttle', async () => {
    await renderWithTheme(<WidgetSync />);
    expect(mockNext.updateTimeline).toHaveBeenCalledTimes(1);
    await act(async () => appStateListener?.('active'));
    expect(mockNext.updateTimeline).toHaveBeenCalledTimes(2);
  });

  test('signing out writes the signed-out widget (nothing personal) straight away', async () => {
    const view = await renderWithTheme(<WidgetSync />);
    mockAuth = { status: 'signedOut' };
    mockViewer = null;
    await act(async () => view.rerender(<ThemeProvider initialRole="adult"><WidgetSync /></ThemeProvider>));
    expect(lastNextWrite()).toContain(G8_COPY.widgetSignedOut);
    expect(lastNextWrite()).not.toMatch(/Teal|Dentist/);
  });

  test('switching accounts: the signed-out widget first, then the new person’s timeline', async () => {
    const view = await renderWithTheme(<WidgetSync />);
    mockViewer = { member: { _id: 'm_twin1' } };
    mockTimeline = WIDGET_KID;
    await act(async () => view.rerender(<ThemeProvider initialRole="adult"><WidgetSync /></ThemeProvider>));
    expect(mockNext.updateSnapshot).toHaveBeenCalled();
    expect(lastNextWrite()).toContain('Zap');
    expect(lastNextWrite()).not.toContain('Dentist');
  });

  test('while auth is loading it writes nothing', async () => {
    mockAuth = { status: 'loading' };
    mockViewer = undefined;
    await renderWithTheme(<WidgetSync />);
    expect(mockNext.updateTimeline).not.toHaveBeenCalled();
    expect(mockNext.updateSnapshot).not.toHaveBeenCalled();
  });
});
