// Owner rule: "walking-MEGA loader, never a plain spinner" — every route that shows a loading state
// (store, talk, homework, places, today, searches, routine/morning, family, lists, mega-profile/look…)
// goes through this one component, so fixing it here fixes all of them at once. It used to render a plain
// ActivityIndicator, which read as a generic spinner rather than the walking MEGA the rest of the app uses
// (src/features/walkers/MegaLoader.tsx, reused by the auth gate and route-change fallback,
// src/features/shell/RouteLoading.tsx).
import { SIGNIN_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { LoadingScreen } from './LoadingScreen';

const ACTIVITY_INDICATOR_TYPE = '"type":"ActivityIndicator"';

describe('LoadingScreen', () => {
  test('renders the walking MEGA loader, not a plain ActivityIndicator', async () => {
    const view = await renderWithTheme(<LoadingScreen label="Loading family…" />);
    // @testing-library/react-native has no ByType query (it steers away from implementation-detail
    // queries), so the absence of the native ActivityIndicator is checked in the rendered host tree.
    expect(JSON.stringify(view.toJSON())).not.toContain(ACTIVITY_INDICATOR_TYPE);
    const loader = view.getByLabelText('Loading family…'); // MegaLoader's root (accessibilityRole="progressbar")
    expect(loader.props.accessibilityRole).toBe('progressbar');
    expect(view.getByText('Loading family…')).toBeTruthy();
  });

  test('keeps its default label when none is given', async () => {
    const view = await renderWithTheme(<LoadingScreen />);
    expect(view.getByText('Loading…')).toBeTruthy();
  });

  // Sanity check that the shared loader component itself is what's reused here, not a lookalike.
  test('uses the same loader words format as the rest of the app (no default "Opening chats" leaking through)', async () => {
    const view = await renderWithTheme(<LoadingScreen label="Opening HQ…" />);
    expect(view.queryByText(SIGNIN_COPY.loader.opening)).toBeNull();
    expect(view.getByText('Opening HQ…')).toBeTruthy();
  });
});
