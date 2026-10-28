// GD (CONTRACT v0.13): Mega Bucks and the Store (owner, Oct 27; PLAN.md -> Mega Bucks and the Store).
// Parents release Mega Bucks; kids spend them here. Prices, labels and the free starter set are config, so
// a price change is an edit here. Art is drawn in code by the sprite/room engines from these ids.
import type { Role } from '../domain/enums';
import type { ANTENNA_IDS, EYE_COLOR_IDS, EYE_STYLE_IDS, STORE_FURNITURE_IDS, STORE_ITEM_IDS } from './ids';

export type StoreItemId = (typeof STORE_ITEM_IDS)[number];
export type AntennaId = (typeof ANTENNA_IDS)[number];
export type EyeStyleId = (typeof EYE_STYLE_IDS)[number];
export type EyeColorId = (typeof EYE_COLOR_IDS)[number];
export type FurnitureKindId = (typeof STORE_FURNITURE_IDS)[number];

export const STORE_SECTIONS = ['furniture', 'sticker', 'color', 'antenna', 'eyes', 'eyeColor'] as const;
export type StoreSection = (typeof STORE_SECTIONS)[number];

/** The Store's tabs, in order (the Eyes tab shows both `eyes` and `eyeColor` items). */
export const STORE_TABS: readonly { id: string; label: string; sections: readonly StoreSection[] }[] = [
  { id: 'furniture', label: 'Furniture', sections: ['furniture'] },
  { id: 'stickers', label: 'Stickers', sections: ['sticker'] },
  { id: 'colors', label: 'Colors', sections: ['color'] },
  { id: 'antennas', label: 'Antennas', sections: ['antenna'] },
  { id: 'eyes', label: 'Eyes', sections: ['eyes', 'eyeColor'] },
];

type CatalogEntry = { label: string; price: number; hex?: string };

/** Everything the Store sells, keyed by item id. Store-only shell hexes match the design boards (Screen 11);
 * eye colors' hexes live with the sprite art (prototypes/megasprite EYE_COLORS) and are mirrored here for
 * the app's swatches. */
export const STORE_CATALOG = {
  'furniture:bed': { label: 'Bed', price: 0 },
  'furniture:desk': { label: 'Desk', price: 0 },
  'furniture:lamp': { label: 'Lamp', price: 0 },
  'furniture:rugSmall': { label: 'Rug', price: 0 },
  'furniture:plant': { label: 'Plant', price: 4 },
  'furniture:toybox': { label: 'Toy box', price: 6 },
  'furniture:beanbag': { label: 'Beanbag', price: 8 },
  'sticker:star': { label: 'Star', price: 5 },
  'sticker:heart': { label: 'Heart', price: 5 },
  'sticker:leaf': { label: 'Leaf', price: 5 },
  'sticker:bolt': { label: 'Bolt', price: 5 },
  'color:bubblegum': { label: 'Bubblegum', price: 10, hex: '#F28AC0' },
  'color:lime': { label: 'Lime', price: 10, hex: '#9ED24A' },
  'color:lava': { label: 'Lava', price: 10, hex: '#E8553B' },
  'color:ocean': { label: 'Ocean', price: 10, hex: '#2F6FD6' },
  'color:cocoa': { label: 'Cocoa', price: 10, hex: '#9A6B4F' },
  'antenna:twin': { label: 'Twin', price: 12 },
  'antenna:star': { label: 'Star', price: 12 },
  'antenna:sprout': { label: 'Sprout', price: 12 },
  'eyes:anime': { label: 'Anime', price: 15 },
  'eyeColor:pink': { label: 'Pink', price: 10, hex: '#FF9AD5' },
  'eyeColor:gold': { label: 'Gold', price: 10, hex: '#FFD54A' },
  'eyeColor:mint': { label: 'Mint', price: 10, hex: '#7DF2B0' },
  'eyeColor:lilac': { label: 'Lilac', price: 10, hex: '#C7A6FF' },
  'eyeColor:ember': { label: 'Ember', price: 10, hex: '#FF8A5B' },
} as const satisfies Record<StoreItemId, CatalogEntry>;

/** The section an item belongs to (the part before the colon). */
export function storeSectionOf(id: StoreItemId): StoreSection {
  return id.slice(0, id.indexOf(':')) as StoreSection;
}

/** The Store's tab row (UX review, Oct 28): all five tabs on one row, each sized to its label. Below
 * `compactBelow` points of screen width the labels drop `fontStep` sizes and the padding tightens, so no
 * label is cut off on small phones. */
export const STORE_TAB_ROW = { gap: 4, padding: 6, compactBelow: 380, compactPadding: 3, compactFontStep: 1 } as const;

/**
 * What a kid owns without buying (the Store shows these as owned):
 * - every item priced 0 (the basic furniture set),
 * - the look parts their MEGA had when it was made (its sticker; a store-only color only if bought),
 * - the six preset shell colors (shared/config/looks.ts COLORS) and the `classic` antenna/eyes/eye color,
 *   which aren't catalog items at all.
 * The Store is kids-only: adults' MEGA looks and rooms stay free and unrestricted (owner, Oct 27).
 */
export const STORE_RULES = {
  shoppers: ['kid'] as readonly Role[],
  ownsCurrentLookAtStart: true,
  freeLookDefaults: { antenna: 'classic', eyes: 'classic', eyeColor: 'classic' } as const satisfies { antenna: AntennaId; eyes: EyeStyleId; eyeColor: EyeColorId },
} as const;

/** Mega Bucks: released by adults, spent by kids. Defaults match the boards (Screen 10). */
export const MEGA_BUCKS = {
  /** Amount pre-filled on a release card; the adult can change it with the stepper. */
  defaults: { practice: 5, chore: 3, bonus: 1 },
  /** The stepper's bounds for one release. */
  minRelease: 1,
  maxRelease: 20,
  /** Who may release. Any adult in the family (owner default: Admin and Partner both can). */
  releasers: ['admin', 'adult'] as readonly Role[],
} as const;
