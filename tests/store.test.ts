// @vitest-environment node
// GD (CONTRACT v0.13): the Store's id lists and catalog agree with each other and with the look-part ids,
// so a price or item change in config can't silently orphan an id.
import { describe, expect, test } from 'vitest';
import { ANTENNA_IDS, EYE_COLOR_IDS, EYE_STYLE_IDS, STICKERS, STORE_FURNITURE_IDS, STORE_ITEM_IDS, STORE_SHELL_IDS } from '../shared/config/ids';
import { COLORS } from '../shared/config/looks';
import { MEGA_BUCKS, STORE_CATALOG, STORE_SECTIONS, STORE_TABS, storeSectionOf } from '../shared/config/store';

describe('Store config', () => {
  test('STORE_ITEM_IDS is exactly the sellable look parts and furniture', () => {
    const expected = [
      ...STORE_FURNITURE_IDS.map((x) => `furniture:${x}`),
      ...STICKERS.filter((x) => x !== 'none').map((x) => `sticker:${x}`),
      ...STORE_SHELL_IDS.map((x) => `color:${x}`),
      ...ANTENNA_IDS.filter((x) => x !== 'classic').map((x) => `antenna:${x}`),
      ...EYE_STYLE_IDS.filter((x) => x !== 'classic').map((x) => `eyes:${x}`),
      ...EYE_COLOR_IDS.filter((x) => x !== 'classic').map((x) => `eyeColor:${x}`),
    ];
    expect([...STORE_ITEM_IDS].sort()).toEqual(expected.sort());
  });

  test('every item is in the catalog with a non-negative whole price, and every section has a tab', () => {
    expect(Object.keys(STORE_CATALOG).sort()).toEqual([...STORE_ITEM_IDS].sort());
    for (const [id, item] of Object.entries(STORE_CATALOG)) expect(Number.isInteger(item.price) && item.price >= 0, id).toBe(true);
    const tabbed = new Set(STORE_TABS.flatMap((t) => t.sections));
    for (const s of STORE_SECTIONS) expect(tabbed.has(s), s).toBe(true);
    for (const id of STORE_ITEM_IDS) expect(STORE_SECTIONS).toContain(storeSectionOf(id));
  });

  test('store-only shell colors are not also free presets', () => {
    const presetHexes = new Set(Object.values(COLORS).map((h) => h.toUpperCase()));
    for (const id of STORE_SHELL_IDS) expect(presetHexes.has(STORE_CATALOG[`color:${id}`].hex.toUpperCase()), id).toBe(false);
  });

  test('Mega Bucks defaults sit inside the release bounds', () => {
    for (const amount of Object.values(MEGA_BUCKS.defaults)) {
      expect(amount).toBeGreaterThanOrEqual(MEGA_BUCKS.minRelease);
      expect(amount).toBeLessThanOrEqual(MEGA_BUCKS.maxRelease);
    }
  });
});
