// G1 fix: HQ's placeholder list used to read "At the charger · Available" with no way to tell whose
// MEGA that was. Each row must show the MEGA's name (and badge) next to its station/status.
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FIXTURE_IDS, TEAL_INFO, ZAP_MEGA } from '@/test/fixtures';
import { megaInfo } from '@/features/shell/megaInfo';
import { HqRoomList, type HqRoom } from './HqRoomList';

const room: HqRoom = {
  room: { _id: 'rooms_1' as never, _creationTime: Date.now(), familyId: FIXTURE_IDS.family, size: { w: 1, h: 1 }, wallColor: '#fff', furniture: [] },
  narration: '1 of 2 MEGAs are busy right now.',
  megas: [
    { megaId: FIXTURE_IDS.teal, station: 'charger', label: 'Charging', busy: false },
    { megaId: FIXTURE_IDS.zap, station: 'desk', label: 'Math homework', busy: true },
  ],
};
const megaById = { [FIXTURE_IDS.teal]: TEAL_INFO, [FIXTURE_IDS.zap]: megaInfo(ZAP_MEGA) };

describe('HqRoomList', () => {
  test("each MEGA's name sits next to its station and status, not a bare status line", async () => {
    await renderWithTheme(<HqRoomList room={room} megaById={megaById} />);
    expect(screen.getByText('Teal — At the charger · Available')).toBeTruthy();
    expect(screen.getByText('Zap — At the desk · Math homework')).toBeTruthy();
  });

  test('a mega missing from the directory still renders its status, just without a name prefix', async () => {
    await renderWithTheme(<HqRoomList room={room} megaById={{}} />);
    expect(screen.getByText('At the charger · Available')).toBeTruthy();
  });
});
