import { act } from '@testing-library/react-native';
import { cancelAnimation, Easing, withTiming } from 'react-native-reanimated';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/ui/theme';
import { HqWalker } from './HqWalker';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { ...actual, __esModule: true, withTiming: jest.fn(actual.withTiming), cancelAnimation: jest.fn(actual.cancelAnimation) };
});

const walker = (x: number, y = 100, still = false, scale = 1) => <HqWalker x={x} y={y} scale={scale} still={still} duration={260}>{null}</HqWalker>;
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

test('a tile change interpolates only the moving axis; ordinary re-renders leave the animation running', async () => {
  const view = await renderWithTheme(walker(100));
  expect(withTiming).not.toHaveBeenCalled();
  await view.rerender(<ThemeProvider>{walker(132)}</ThemeProvider>);
  expect(withTiming).toHaveBeenCalledTimes(1);
  expect(withTiming).toHaveBeenCalledWith(132, { duration: 260, easing: Easing.linear });
  jest.mocked(withTiming).mockClear();
  await act(async () => { jest.advanceTimersByTime(100); });
  await view.rerender(<ThemeProvider>{walker(132)}</ThemeProvider>);
  expect(withTiming).not.toHaveBeenCalled();
  await view.rerender(<ThemeProvider>{walker(132, 132)}</ThemeProvider>);
  expect(withTiming).toHaveBeenCalledTimes(1);
  await view.unmount();
});

test('hiding/reduced motion cancels movement; resizing snaps without sweeping across the room', async () => {
  const view = await renderWithTheme(walker(100));
  await view.rerender(<ThemeProvider>{walker(132)}</ThemeProvider>);
  jest.mocked(withTiming).mockClear();
  jest.mocked(cancelAnimation).mockClear();
  await view.rerender(<ThemeProvider>{walker(200, 100, true)}</ThemeProvider>);
  expect(cancelAnimation).toHaveBeenCalledTimes(2);
  expect(withTiming).not.toHaveBeenCalled();
  await view.rerender(<ThemeProvider>{walker(200)}</ThemeProvider>);
  await view.rerender(<ThemeProvider>{walker(400, 200, false, 2)}</ThemeProvider>);
  expect(withTiming).not.toHaveBeenCalled();
  jest.mocked(cancelAnimation).mockClear();
  await view.unmount();
  expect(cancelAnimation).toHaveBeenCalledTimes(2);
});
