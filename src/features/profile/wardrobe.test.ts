// What the look picker offers (owner, Oct 28: customizing from the MEGA profile, including the Store parts the
// person owns). Adults pick from everything (their looks are free, STORE_RULES); a kid picks only from the
// free basics plus what they've bought, and always keeps what their MEGA is wearing now.
import { COLORS } from '@shared/config/looks';
import { wardrobeFor } from './wardrobe';

const CURRENT = { hex: COLORS.violet, sticker: 'bolt' as const, antenna: 'classic' as const };

describe('wardrobeFor', () => {
  test('an adult gets every antenna, eye style, eye color, sticker and color', () => {
    const w = wardrobeFor('adult', null, CURRENT);
    expect(w.antennas).toEqual(['classic', 'twin', 'star', 'sprout']);
    expect(w.eyes).toEqual(['classic', 'anime']);
    expect(w.eyeColors).toEqual(['classic', 'pink', 'gold', 'mint', 'lilac', 'ember']);
    expect(w.stickers).toEqual(expect.arrayContaining(['star', 'heart', 'leaf', 'bolt', 'none']));
    expect(w.colors).toEqual(expect.arrayContaining([...Object.values(COLORS), '#F28AC0']));
  });

  test('a kid gets the classics, the preset colors, what they bought and what they wear — nothing else', () => {
    const w = wardrobeFor('kid', ['antenna:star', 'eyeColor:mint', 'color:ocean', 'furniture:plant'], CURRENT);
    expect(w.antennas).toEqual(['classic', 'star']);
    expect(w.eyes).toEqual(['classic']);
    expect(w.eyeColors).toEqual(['classic', 'mint']);
    expect(w.stickers).toEqual(['bolt', 'none']);
    expect(w.colors).toEqual([...Object.values(COLORS), '#2F6FD6']);
  });

  test('a kid with nothing bought yet (or the catalog still loading) still has the basics', () => {
    const w = wardrobeFor('kid', null, CURRENT);
    expect(w.antennas).toEqual(['classic']);
    expect(w.stickers).toEqual(['bolt', 'none']);
  });
});
