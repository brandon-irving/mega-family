// The Store's pure logic (board Store, Screen 11): tabs, try-on, and what the bottom bar offers.
import { CATALOG, ZAP_LOOK } from '@/test/gdFixtures';
import { barFor, firstPick, isWearing, patchFor, tilesFor, tryOn } from './storeModel';

describe('tilesFor', () => {
  test('each tab shows only its own sections (Eyes shows designs and eye colors)', () => {
    expect(tilesFor('furniture', CATALOG, ZAP_LOOK).every((t) => t.section === 'furniture')).toBe(true);
    const eyes = tilesFor('eyes', CATALOG, ZAP_LOOK);
    expect(eyes.map((t) => t.key)).toEqual(['eyes:classic', 'eyes:anime', 'eyeColor:pink']);
  });

  test('free parts come first and are owned: Classic antenna, Classic eyes, the kid’s own color', () => {
    expect(tilesFor('antennas', CATALOG, ZAP_LOOK)[0]).toMatchObject({ key: 'antenna:classic', owned: true, price: 0 });
    expect(tilesFor('colors', CATALOG, ZAP_LOOK)[0]).toMatchObject({ key: 'color:mine', owned: true, patch: { hex: '#8E6CE0' } });
  });

  test('a kid already wearing a Store color gets no extra "Yours" tile', () => {
    expect(tilesFor('colors', CATALOG, { ...ZAP_LOOK, hex: '#f28ac0' }).some((t) => t.key === 'color:mine')).toBe(false);
  });

  test('opens on the first thing the kid can shop for', () => {
    expect(firstPick(tilesFor('furniture', CATALOG, ZAP_LOOK))).toBe('furniture:beanbag');
    expect(firstPick(tilesFor('stickers', CATALOG, ZAP_LOOK))).toBe('sticker:star');
  });
});

describe('try-on', () => {
  test('a catalog item patches exactly its own part', () => {
    expect(patchFor({ id: 'antenna:star' })).toEqual({ antenna: 'star' });
    expect(patchFor({ id: 'eyeColor:pink' })).toEqual({ eyeColor: 'pink' });
    expect(patchFor({ id: 'color:bubblegum', hex: '#F28AC0' })).toEqual({ hex: '#F28AC0' });
    expect(patchFor({ id: 'furniture:beanbag' })).toEqual({});
  });

  test('trying an eye color keeps bought anime eyes on', () => {
    const tile = tilesFor('eyes', CATALOG, ZAP_LOOK).find((t) => t.key === 'eyeColor:pink')!;
    expect(tryOn({ ...ZAP_LOOK, eyes: 'anime' }, tile)).toMatchObject({ eyes: 'anime', eyeColor: 'pink' });
  });

  test('wearing compares the whole look with classic defaults filled in', () => {
    const classic = tilesFor('antennas', CATALOG, ZAP_LOOK)[0];
    expect(isWearing(ZAP_LOOK, classic)).toBe(true);
    expect(isWearing({ ...ZAP_LOOK, antenna: 'star' }, classic)).toBe(false);
  });
});

describe('barFor', () => {
  const tile = (tab: Parameters<typeof tilesFor>[0], key: string) => tilesFor(tab, CATALOG, ZAP_LOOK).find((t) => t.key === key)!;

  test('Buy for N when affordable, with what would be left', () => {
    expect(barFor(tile('antennas', 'antenna:star'), ZAP_LOOK, 12)).toMatchObject({ kind: 'buy', price: 12, left: 0 });
  });

  test('Need N more when short (StoreEyes board: balance 3, anime eyes 15)', () => {
    expect(barFor(tile('eyes', 'eyes:anime'), ZAP_LOOK, 3)).toMatchObject({ kind: 'short', short: 12 });
  });

  test('owned look parts offer Wear it; the one already on says Wearing', () => {
    expect(barFor(tile('antennas', 'antenna:classic'), { ...ZAP_LOOK, antenna: 'star' }, 0).kind).toBe('wear');
    expect(barFor(tile('stickers', 'sticker:bolt'), ZAP_LOOK, 0).kind).toBe('wearing');
  });

  test('owned furniture is In your room, never bought twice', () => {
    expect(barFor(tile('furniture', 'furniture:plant'), ZAP_LOOK, 100).kind).toBe('inRoom');
  });
});
