// G5 review fixes for the HQ room:
// - correctness finding 7: the walker step timer was torn down and rebuilt on every unrelated re-render (the
//   route rebuilt `megas` each render and the clock query ticks), so walking could stutter or freeze.
// - UX finding 6: all MEGAs resting at the charger stacked onto the same few tiles.
// - UX finding 7: tapping Hub (the family MEGA) opened a panel with only Close.
// - UX finding 6: only the first three members got a room door; now every member's room is one tap away.
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Profiler } from 'react';
import { G5_FIX_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/ui/theme';
import { HqRoom, targetTiles, type RoomDoor, type RoomMega } from './HqRoom';
import { HQ_LAYOUT, isWalkable } from './hqLayout';

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: () => false }));

const mega = (id: string, over: Partial<RoomMega> = {}): RoomMega => ({ megaId: id, name: id, hex: '#2FB8B0', sticker: 'none', station: 'charger', label: 'Resting', busy: false, mine: false, ownerId: `m_${id}`, ...over });
const SIX = ['teal', 'coral', 'zap', 'sunny', 'pebble', 'hub'].map((id) => mega(id));
const DOORS: RoomDoor[] = ['Admin', 'Partner', 'Twin 1', 'Twin 2', 'Toddler'].map((name, i) => ({ memberId: `m_${i}`, name, mine: i === 0 }));

const props = (megas: RoomMega[], over: Partial<Parameters<typeof HqRoom>[0]> = {}) => ({
  megas,
  doors: DOORS,
  narration: 'Everyone’s resting.',
  width: 360,
  onTalk: jest.fn(),
  onDetails: jest.fn(),
  onVisitRoom: jest.fn(),
  onPlaceAction: jest.fn(),
  ...over,
});

describe('targetTiles', () => {
  test('six MEGAs resting at the charger each get their own walkable tile', () => {
    const tiles = Object.values(targetTiles(SIX));
    expect(new Set(tiles.map((t) => `${t[0]},${t[1]}`)).size).toBe(6);
    expect(tiles.every((t) => isWalkable(t))).toBe(true);
    // Spread along the charger's row first, so sprites taller than a tile don't stand on each other.
    const row = HQ_LAYOUT.stations.charger.tile[1];
    expect(tiles.filter((t) => t[1] === row).length).toBeGreaterThanOrEqual(4);
  });
});

describe('HqRoom walker timer', () => {
  test('a hidden room does no timer-driven React work', async () => {
    jest.useFakeTimers();
    const onRender = jest.fn();
    try {
      const view = await renderWithTheme(
        <Profiler id="hq" onRender={onRender}>
          <HqRoom active={false} {...props([mega('teal')])} />
        </Profiler>,
      );
      onRender.mockClear();
      for (let tick = 0; tick < 40; tick++) {
        await act(async () => { jest.advanceTimersByTime(260); });
      }
      expect(onRender).not.toHaveBeenCalled();
      await view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test('walking stops on arrival and starts again when the destination changes', async () => {
    jest.useFakeTimers();
    const onRender = jest.fn();
    const room = (station: RoomMega['station']) => (
      <Profiler id="hq" onRender={onRender}>
        <HqRoom {...props([mega('teal', { station, busy: true })])} />
      </Profiler>
    );
    const advance = async (ticks: number) => {
      for (let i = 0; i < ticks; i++) await act(async () => { jest.advanceTimersByTime(260); });
    };
    try {
      const view = await renderWithTheme(room('desk'));
      onRender.mockClear();
      await advance(1);
      expect(onRender).toHaveBeenCalled();
      await advance(40);
      onRender.mockClear();
      await advance(10);
      expect(onRender).not.toHaveBeenCalled();

      await view.rerender(<ThemeProvider>{room('fridge')}</ThemeProvider>);
      onRender.mockClear();
      await advance(1);
      expect(onRender).toHaveBeenCalled();
      await advance(40);
      onRender.mockClear();
      await advance(10);
      expect(onRender).not.toHaveBeenCalled();
      await view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a re-render with the same MEGAs (new array) keeps the step timer running', async () => {
    jest.useFakeTimers();
    const setSpy = jest.spyOn(global, 'setInterval');
    const clearSpy = jest.spyOn(global, 'clearInterval');
    // try/finally: a failed assertion must not leak fake timers into the rest of the file (G8 review).
    try {
      const walking = [mega('teal', { station: 'desk', busy: true, label: 'Homework' })];
      const view = await renderWithTheme(<HqRoom {...props(walking)} />);
      const sets = setSpy.mock.calls.length;
      const clears = clearSpy.mock.calls.length;
      await act(async () => {
        await view.rerender(
          <ThemeProvider initialRole="adult">
            <HqRoom {...props(walking.map((m) => ({ ...m })))} />
          </ThemeProvider>,
        );
      });
      expect(setSpy.mock.calls.length).toBe(sets);
      expect(clearSpy.mock.calls.length).toBe(clears);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});

describe('HqRoom panels and rooms', () => {
  test('station details stay in the room, offer the supported action, and close without navigation', async () => {
    const onPlaceAction = jest.fn();
    await renderWithTheme(<HqRoom {...props([], { onPlaceAction, ideasAvailable: true })} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bookshelf' }));
    const panel = within(screen.getByTestId('hq-room')).getByTestId('hq-box');
    await fireEvent.press(within(panel).getByRole('button', { name: 'Open ideas' }));
    expect(onPlaceAction).toHaveBeenCalledWith('bookshelf');
    await fireEvent.press(within(panel).getByRole('button', { name: U.close }));
    expect(screen.queryByTestId('hq-box')).toBeNull();
  });

  test('the text alternative selects a station and returns to the room context', async () => {
    await renderWithTheme(<HqRoom {...props([])} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Explore HQ' }));
    await fireEvent.press(within(screen.getByTestId('hq-browse')).getByRole('button', { name: 'Calendar' }));
    expect(screen.queryByTestId('hq-browse')).toBeNull();
    expect(within(screen.getByTestId('hq-box')).getByRole('button', { name: U.openCalendar })).toBeTruthy();
  });
  test('tapping Hub (no owner) offers Talk to Hub and says what Hub does — not a Close-only dead end', async () => {
    const onTalk = jest.fn();
    await renderWithTheme(<HqRoom {...props([mega('Hub', { ownerId: undefined })], { onTalk })} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Hub, /));
    });
    expect(screen.getByText(fillCopy(G5_FIX_COPY.hubAbout, { name: 'Hub' }))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: fillCopy(G5_FIX_COPY.hubTalk, { name: 'Hub' }) }));
    });
    expect(onTalk).toHaveBeenCalledTimes(1);
  });

  test('every member’s room is one tap away, not just the three drawn doors', async () => {
    const onVisitRoom = jest.fn();
    await renderWithTheme(<HqRoom {...props(SIX, { onVisitRoom })} />);
    for (const d of DOORS) {
      const label = d.mine ? U.yourRoom : fillCopy(U.memberRoom, { name: d.name });
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0);
    }
    await act(async () => {
      fireEvent.press(screen.getAllByRole('button', { name: fillCopy(U.memberRoom, { name: 'Toddler' }) })[0]);
    });
    expect(onVisitRoom).toHaveBeenCalledWith('m_4');
  });
});
