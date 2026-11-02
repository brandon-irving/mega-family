import { fireEvent, screen } from '@testing-library/react-native';
import { Text as MockText } from 'react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { DemoQuickMenu } from './DemoQuickMenu';

let mockActive = true;
let mockDesktop = false;
let mockRole = 'admin';
jest.mock('@/data/useDemoProfile', () => ({ useDemoProfile: () => ({ profile: { active: mockActive, currentName: 'Brandon' } }) }));
jest.mock('@/data/useViewer', () => ({ useViewer: () => ({ member: { role: mockRole } }) }));
jest.mock('@/ui/useDesktopLayout', () => ({ useDesktopLayout: () => mockDesktop }));
jest.mock('./DemoSessionBar', () => ({ DemoSessionBar: () => <MockText>Switch person control</MockText> }));
jest.mock('./DemoConsole', () => ({ DemoConsole: ({ quick }: { quick?: boolean }) => <MockText>{quick ? 'Shared quick actions' : 'Full console'}</MockText> }));
beforeEach(() => { mockActive = true; mockDesktop = false; mockRole = 'admin'; });

test('ordinary sessions and the wrong platform have no demo launcher', async () => {
  mockActive = false;
  const result = await renderWithTheme(<DemoQuickMenu placement="floating" />);
  expect(screen.queryByLabelText('Open demo controls')).toBeNull();
  mockActive = true; mockDesktop = true;
  await result.rerender(<DemoQuickMenu placement="floating" />);
  expect(screen.queryByLabelText('Open demo controls')).toBeNull();
});

test('mobile menu shows the current person and shared admin actions only after opening', async () => {
  await renderWithTheme(<DemoQuickMenu placement="floating" />);
  expect(screen.queryByText('Shared quick actions')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Open demo controls'));
  expect(screen.getByText('Current person · Brandon')).toBeTruthy();
  expect(screen.getByText('Switch person control')).toBeTruthy();
  expect(screen.getByText('Shared quick actions')).toBeTruthy();
});

test('recipient profiles must return to the admin before destructive or connection actions', async () => {
  mockRole = 'kid';
  await renderWithTheme(<DemoQuickMenu placement="floating" />);
  await fireEvent.press(screen.getByLabelText('Open demo controls'));
  expect(screen.queryByText('Shared quick actions')).toBeNull();
  expect(screen.getByText(/Return to the demo admin above/)).toBeTruthy();
});

test('desktop launcher opens the full tabbed demo console', async () => {
  mockDesktop = true;
  await renderWithTheme(<DemoQuickMenu placement="sidebar" />);
  expect(screen.queryByText('Full console')).toBeNull();
  await fireEvent.press(screen.getByText('Demo controls'));
  expect(screen.getByText('Full console')).toBeTruthy();
  expect(screen.queryByText('Shared quick actions')).toBeNull();
});
