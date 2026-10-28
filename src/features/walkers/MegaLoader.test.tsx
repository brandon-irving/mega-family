// The shared loader (owner, Oct 28: "a MEGA walking back and forth on the text in the center of the
// screen"; LoginOpening board). It replaces the old blank-then-walk-in opening: the words are there from
// the first frame, never a blank screen.
import { act, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WALKER_MOTION as M } from '@shared/config/walkers';
import { SIGNIN_COPY } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { assignPlan, createWalker, tickWalker, type Ctx } from './engine';
import { LOADER_SCENE, MegaLoader } from './MegaLoader';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

describe('MegaLoader', () => {
  test('shows "Opening chats" from the first frame (never blank), as a progress indicator', async () => {
    await act(async () => {
      renderWithTheme(
        <SafeAreaProvider initialMetrics={METRICS}>
          <MegaLoader testID="opening" reducedMotion />
        </SafeAreaProvider>,
      );
    });
    expect(screen.getByText(SIGNIN_COPY.loader.opening)).toBeTruthy();
    const root = screen.getByTestId('opening');
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityLabel).toBe(SIGNIN_COPY.loader.opening);
  });

  test('takes other words', async () => {
    await act(async () => {
      renderWithTheme(
        <SafeAreaProvider initialMetrics={METRICS}>
          <MegaLoader text="Opening your invite" reducedMotion />
        </SafeAreaProvider>,
      );
    });
    expect(screen.getByText('Opening your invite')).toBeTruthy();
  });
});

describe('loader scene', () => {
  const ledge = { x: 24, y: 400, w: 342 };
  const centre = ledge.x + ledge.w / 2;

  test('the MEGA paces back and forth over the words (both sides of the middle)', () => {
    const m = createWalker('teal');
    const ctx: Ctx = { now: 0, ledges: { loader: ledge }, reduced: false };
    assignPlan(m, LOADER_SCENE.teal, ctx);
    let left = Infinity;
    let right = -Infinity;
    for (let t = 0; t < 20_000; t += M.tickMs) {
      ctx.now += M.tickMs;
      tickWalker(m, ctx);
      left = Math.min(left, m.x);
      right = Math.max(right, m.x);
    }
    expect(left).toBeLessThan(centre - 30);
    expect(right).toBeGreaterThan(centre + 30);
    expect(m.hidden).toBe(false);
    expect(m.blocked).toBe(false);
  });

  test('reduced motion: it stands still in the middle', () => {
    const m = createWalker('teal');
    const ctx: Ctx = { now: 0, ledges: { loader: ledge }, reduced: true };
    assignPlan(m, LOADER_SCENE.teal, ctx);
    for (let t = 0; t < 5_000; t += M.tickMs) {
      ctx.now += M.tickMs;
      tickWalker(m, ctx);
      expect(m.x).toBeCloseTo(centre);
    }
  });

  test('only one MEGA walks (the others stay hidden)', () => {
    for (const id of ['coral', 'violet'] as const) {
      const m = createWalker(id);
      const ctx: Ctx = { now: 0, ledges: { loader: ledge }, reduced: false };
      assignPlan(m, LOADER_SCENE[id], ctx);
      tickWalker(m, ctx);
      expect(m.hidden).toBe(true);
    }
  });
});
