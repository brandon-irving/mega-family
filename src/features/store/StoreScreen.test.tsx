// Board Store and its tabs, StoreEyes ("Need N more"), StoreConfirm → StoreBought; plus StoreTray's NEW.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { CATALOG, ZAP_LOOK } from '@/test/gdFixtures';
import { trayPieces } from './KidRoomPanel';
import { StoreScreenView } from './StoreScreen';

const noop = () => {};

describe('StoreScreenView', () => {
  test('opens on Furniture with the balance and the first thing to shop for', async () => {
    await renderWithTheme(<StoreScreenView megaName="Zap" balance={12} items={CATALOG} look={ZAP_LOOK} onClose={noop} onBuy={async () => true} onWear={noop} onDecorate={noop} />, { role: 'kid' });
    expect(screen.getByLabelText('You have 12 Mega Bucks')).toBeTruthy();
    expect(screen.getByText('Buy for 8')).toBeTruthy(); // the beanbag
    expect(screen.getByText('You have 12. You’d have 4 left.')).toBeTruthy();
  });

  // GD UX review HIGH: the tab row scrolled, so picking Eyes pushed Furniture off-screen with no sign it
  // was there. All five tabs share one fixed row, each an even share of the width.
  test('all five tabs sit in one fixed row, each taking an even share', async () => {
    await renderWithTheme(<StoreScreenView megaName="Zap" balance={3} items={CATALOG} look={ZAP_LOOK} initialTab="eyes" onClose={noop} onBuy={async () => true} onWear={noop} onDecorate={noop} />, { role: 'kid' });
    const list = screen.getByTestId('store-tabs');
    expect(list.props.horizontal).toBeUndefined(); // not a ScrollView
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    for (const t of tabs) expect(t.props.style).toEqual(expect.objectContaining({ flex: 1 }));
  });

  test('Eyes tab with 3 Mega Bucks: anime eyes need 12 more and the bar is disabled', async () => {
    await renderWithTheme(<StoreScreenView megaName="Zap" balance={3} items={CATALOG} look={ZAP_LOOK} initialTab="eyes" onClose={noop} onBuy={async () => true} onWear={noop} onDecorate={noop} />, { role: 'kid' });
    expect(screen.getByText('Trying on'.toUpperCase())).toBeTruthy();
    expect(screen.getByText('Need 12 more')).toBeTruthy();
    expect(screen.getByLabelText('Need 12 more').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  test('buying asks first, then says it’s yours', async () => {
    const onBuy = jest.fn(async () => true);
    await renderWithTheme(<StoreScreenView megaName="Zap" balance={20} items={CATALOG} look={ZAP_LOOK} initialTab="antennas" onClose={noop} onBuy={onBuy} onWear={noop} onDecorate={noop} />, { role: 'kid' });
    await fireEvent.press(screen.getByText('Buy for 12'));
    expect(screen.getByText('Buy Star antenna?')).toBeTruthy();
    expect(screen.getByText('12 Mega Bucks. You’ll have 8 left.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Buy it'));
    expect(onBuy).toHaveBeenCalledWith(expect.objectContaining({ key: 'antenna:star' }));
    expect(screen.getByText('It’s yours!')).toBeTruthy();
  });

  test('a refused purchase keeps the confirm sheet open', async () => {
    await renderWithTheme(<StoreScreenView megaName="Zap" balance={20} items={CATALOG} look={ZAP_LOOK} initialTab="antennas" error="That didn’t look right — want to try again?" onClose={noop} onBuy={async () => false} onWear={noop} onDecorate={noop} />, { role: 'kid' });
    await fireEvent.press(screen.getByText('Buy for 12'));
    await fireEvent.press(screen.getByText('Buy it'));
    expect(screen.queryByText('It’s yours!')).toBeNull();
    expect(screen.getByText('Buy Star antenna?')).toBeTruthy();
  });
});

describe('trayPieces (board StoreTray)', () => {
  test('owned furniture only; not-yet-placed pieces are NEW and come first', () => {
    const items = CATALOG.map((i) => (i.id === 'furniture:beanbag' ? { ...i, owned: true } : i));
    const tray = trayPieces(items, { furniture: [{ kind: 'bed', x: 0, y: 2 }, { kind: 'plant', x: 1, y: 2 }] });
    expect(tray.map((t) => [t.kind, t.isNew])).toEqual([
      ['beanbag', true],
      ['bed', false],
      ['plant', false],
    ]);
  });
});
