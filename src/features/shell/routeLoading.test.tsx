// GD UX review BLOCKER (owner, Oct 28: "never a blank screen"): on web, the frames between demo sign-in and
// the first chat frame were blank. SDK 58 turns async routes on for web (dev and production), and an
// async route shows Expo's default (empty) fallback while its bundle loads, ignoring custom fallbacks.
// So: async routes stay off on web, and the root layout's SuspenseFallback is the walking-MEGA loader.
import { readFileSync } from 'fs';
import { join } from 'path';
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { RouteLoading } from './RouteLoading';

const root = join(__dirname, '..', '..', '..');

test('async routes are off on web, so the custom fallback (not a blank frame) shows while a route loads', () => {
  const config = readFileSync(join(root, 'app.config.ts'), 'utf8');
  expect(config).toMatch(/\['expo-router',\s*\{\s*asyncRoutes:\s*\{\s*web:\s*false\s*\}\s*\}\]/);
});

test('the root layout exports the walking-MEGA loader as its SuspenseFallback', () => {
  const layout = readFileSync(join(root, 'src', 'app', '_layout.tsx'), 'utf8');
  expect(layout).toMatch(/export\s*\{\s*RouteLoading as SuspenseFallback\s*\}/);
});

// The walking MEGA itself appears once its ledge is measured on a real screen (jest has no layout); the
// live web check records it frame by frame.
test('the route fallback is the MEGA loader, with its words from the first frame', async () => {
  await renderWithTheme(<RouteLoading />);
  expect(screen.getByTestId('route-loading')).toBeTruthy();
  expect(screen.getByText('Opening chats')).toBeTruthy();
});
