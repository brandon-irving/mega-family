// G5 review fixes for the HQ room:
// - correctness finding 7: the walker step timer was torn down and rebuilt on every unrelated re-render (the
//   route rebuilt `megas` each render and the clock query ticks), so walking could stutter or freeze.
// - UX finding 6: all MEGAs resting at the charger stacked onto the same few tiles.
// - UX finding 7: tapping Hub (the family MEGA) opened a panel with only Close.
// - UX finding 6: only the first three members got a room door; now every member's room is one tap away.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { G5_FIX_COPY, G5_UI_COPY as U, fillCopy } from '@shared/config/copy';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/ui/theme';
import { HqRoom, targetTiles, type RoomDoor, type RoomMega } from './HqRoom';
import { HQ_LAYOUT, isWalkable } from './hqLayout';

jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => false }));

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
  test('a re-render with the same MEGAs (new array) keeps the step timer running', async () => {
    jest.useFakeTimers();
    const setSpy = jest.spyOn(global, 'setInterval');
    const clearSpy = jest.spyOn(global, 'clearInterval');
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
    setSpy.mockRestore();
    clearSpy.mockRestore();
    jest.useRealTimers();
  });
});

describe('HqRoom panels and rooms', () => {
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
