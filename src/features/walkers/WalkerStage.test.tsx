// Regression (found live on web, Oct 28): when a MEGA poked or dipped a ledge, the stage's context value
// changed, every <Ledge>'s cleanup re-ran and unregistered itself, and all the MEGAs stopped dead waiting for
// ledges that were never measured again. A ledge must only unregister when it unmounts.
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/ui/theme';
import { act, fireEvent } from '@testing-library/react-native';
import { withTiming } from 'react-native-reanimated';
import { AppState, type AppStateStatus } from 'react-native';
import { WALKER_MOTION } from '@shared/config/walkers';
import { Lane, Ledge, Obstacle, WalkerStage, WalkerStageContext, type StageCtx } from './WalkerStage';
import { SHOW, script } from './engine';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { ...actual, __esModule: true, withTiming: jest.fn(actual.withTiming) };
});

test('the scene interval is suspended for a hidden route, reduced motion, and app background', async () => {
  jest.useFakeTimers();
  const interval = jest.spyOn(global, 'setInterval');
  let change: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  const previousSubscribe = AppState.addEventListener;
  AppState.addEventListener = jest.fn((event, listener) => { if (event === 'change') change = listener as (state: AppStateStatus) => void; return { remove }; });
  try {
    const view = await renderWithTheme(<WalkerStage scene={{}} active={false} reducedMotion={false}>{null}</WalkerStage>);
    expect(interval.mock.calls.filter(([, ms]) => ms === WALKER_MOTION.tickMs)).toHaveLength(0);
    await view.rerender(<ThemeProvider><WalkerStage scene={{}} reducedMotion>{null}</WalkerStage></ThemeProvider>);
    expect(interval.mock.calls.filter(([, ms]) => ms === WALKER_MOTION.tickMs)).toHaveLength(0);
    await view.rerender(<ThemeProvider><WalkerStage scene={{}} reducedMotion={false}>{null}</WalkerStage></ThemeProvider>);
    expect(interval.mock.calls.filter(([, ms]) => ms === WALKER_MOTION.tickMs)).toHaveLength(1);
    const cleared = jest.spyOn(global, 'clearInterval');
    await act(async () => { change?.('background'); });
    expect(cleared).toHaveBeenCalled();
    interval.mockClear();
    await act(async () => { jest.advanceTimersByTime(10000); });
    expect(interval).not.toHaveBeenCalled();
    await act(async () => { change?.('active'); });
    expect(interval.mock.calls.filter(([, ms]) => ms === WALKER_MOTION.tickMs)).toHaveLength(1);
    await view.unmount();
    expect(remove).toHaveBeenCalled();
    cleared.mockRestore();
  } finally { AppState.addEventListener = previousSubscribe; interval.mockRestore(); jest.useRealTimers(); }
});

test('unchanged walkers do not restart position and opacity animations on every engine tick', async () => {
  jest.useFakeTimers();
  try {
    const view = await renderWithTheme(<WalkerStage scene={{}} reducedMotion={false}>{null}</WalkerStage>);
    jest.mocked(withTiming).mockClear();
    await act(async () => { jest.advanceTimersByTime(WALKER_MOTION.tickMs * 10); });
    expect(withTiming).not.toHaveBeenCalled();
    await view.unmount();
  } finally {
    jest.useRealTimers();
  }
});

test('a visibility change still fades once, then leaves the finished animation alone', async () => {
  jest.useFakeTimers();
  try {
    const view = await renderWithTheme(<WalkerStage scene={{}} reducedMotion={false}>{null}</WalkerStage>);
    jest.mocked(withTiming).mockClear();
    await view.rerender(<ThemeProvider><WalkerStage scene={{ teal: script([SHOW]) }} reducedMotion={false}>{null}</WalkerStage></ThemeProvider>);
    await act(async () => { jest.advanceTimersByTime(WALKER_MOTION.tickMs * 10); });
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(withTiming).toHaveBeenCalledWith(1, { duration: 300 });

    jest.mocked(withTiming).mockClear();
    await view.rerender(<ThemeProvider><WalkerStage scene={{}} reducedMotion={false}>{null}</WalkerStage></ThemeProvider>);
    await act(async () => { jest.advanceTimersByTime(WALKER_MOTION.tickMs * 10); });
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(withTiming).toHaveBeenCalledWith(0, { duration: 300 });
    await view.unmount();
  } finally {
    jest.useRealTimers();
  }
});

function fakeStage(over: Partial<StageCtx> = {}): StageCtx {
  return { register: jest.fn(), unregister: jest.fn(), lookAtLedge: jest.fn(), dipped: new Set(), poked: new Set(), ...over };
}

describe('Ledge', () => {
  test('a dip or poke elsewhere on the stage (a new context value) does not unregister the ledge', async () => {
    const base = fakeStage();
    const view = await renderWithTheme(
      <WalkerStageContext.Provider value={base}>
        <Ledge id="make" pressable />
      </WalkerStageContext.Provider>,
    );
    // Same stable callbacks, new dip/poke sets — exactly what the stage provides on each change.
    const next = { ...base, dipped: new Set(['make']), poked: new Set(['signin']) };
    // rerender() replaces the whole tree, so the theme provider renderWithTheme added goes back in by hand.
    await view.rerender(
      <ThemeProvider>
        <WalkerStageContext.Provider value={next}>
          <Ledge id="make" pressable />
        </WalkerStageContext.Provider>
      </ThemeProvider>,
    );
    expect(base.unregister).not.toHaveBeenCalled();
  });

  test('unmounting a ledge unregisters it', async () => {
    const stage = fakeStage();
    const view = await renderWithTheme(
      <WalkerStageContext.Provider value={stage}>
        <Ledge id="make" />
      </WalkerStageContext.Provider>,
    );
    await view.unmount();
    expect(stage.unregister).toHaveBeenCalledWith('make');
  });
});

// Owner, Oct 28: MEGAs never cover content. An <Obstacle> is content nobody stands on; a <Lane> is an empty
// strip MEGAs walk along with no content of its own (feet on its bottom edge).
describe('Obstacle and Lane', () => {
  const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 44 } } };
  test('an Obstacle registers as content only, never as a ledge', async () => {
    const stage = fakeStage();
    const view = await renderWithTheme(
      <WalkerStageContext.Provider value={stage}>
        <Obstacle id="code" testID="obstacle" />
      </WalkerStageContext.Provider>,
    );
    await fireEvent(view.getByTestId('obstacle'), 'layout', layout);
    expect(stage.register).toHaveBeenCalledWith('code', expect.anything(), expect.objectContaining({ ledge: false }));
  });

  test('a Lane is a ledge at its bottom edge with no content rect', async () => {
    const stage = fakeStage();
    const view = await renderWithTheme(
      <WalkerStageContext.Provider value={stage}>
        <Lane id="signin" testID="lane" />
      </WalkerStageContext.Provider>,
    );
    await fireEvent(view.getByTestId('lane'), 'layout', layout);
    expect(stage.register).toHaveBeenCalledWith('signin', expect.anything(), expect.objectContaining({ obstacle: false, inset: 44 }));
  });
});
