// The look picker offers the Store parts from the person's wardrobe (owner, Oct 28): a kid sees only the
// antennas they own, no custom hex; saving sends the parts along with the color and sticker.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { COLORS } from '@shared/config/looks';
import { LookPersonalityContent } from './LookPersonalityContent';
import { wardrobeFor } from './wardrobe';

const VALUE = { hex: COLORS.violet, sticker: 'bolt' as const, personality: 'funny' as const, antenna: 'classic' as const };

describe('LookPersonalityContent with a wardrobe', () => {
  test('a kid sees only the parts they own and no custom hex; Save sends the picked part', async () => {
    const onSave = jest.fn();
    await renderWithTheme(<LookPersonalityContent value={VALUE} wardrobe={wardrobeFor('kid', ['antenna:star'], VALUE)} onSave={onSave} />, { role: 'kid' });
    expect(screen.getByText('Antenna')).toBeTruthy();
    expect(screen.queryByText('Sprout')).toBeNull();
    expect(screen.queryByLabelText('Custom hex color')).toBeNull();
    await fireEvent.press(screen.getAllByText('Star').find((n) => n)!);
    await fireEvent.press(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ antenna: 'star', hex: COLORS.violet, sticker: 'bolt' }));
  });

  test('an adult sees every antenna and the custom hex', async () => {
    await renderWithTheme(<LookPersonalityContent value={VALUE} wardrobe={wardrobeFor('adult', null, VALUE)} onSave={jest.fn()} />);
    expect(screen.getByText('Sprout')).toBeTruthy();
    expect(screen.getByLabelText('Custom hex color')).toBeTruthy();
  });

  test('without a wardrobe (the join flow), no Store parts show', async () => {
    await renderWithTheme(<LookPersonalityContent value={VALUE} onSave={jest.fn()} />);
    expect(screen.queryByText('Antenna')).toBeNull();
  });
});
