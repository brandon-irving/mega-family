// The Store's pure logic (board Store, Screen 11), separate from rendering so it's testable without a
// server: which tiles each tab shows (the catalog plus the free "classic"/current parts the board lists
// first), what a tile tried on looks like, and what the bottom bar offers (Wearing / Wear it / Buy for N /
// Need N more). Prices, labels and tabs all come from config (shared/config/store.ts) via `store.catalog`.
import { type AntennaId, type EyeColorId, type EyeStyleId, type FurnitureKindId, STORE_RULES, STORE_TABS, storeSectionOf, type StoreItemId, type StoreSection } from '@shared/config/store';
import type { StickerId } from '@shared/config/looks';
import { STORE_COPY } from '@shared/config/copy';

export type Look = { hex: string; sticker: StickerId; antenna?: AntennaId; eyes?: EyeStyleId; eyeColor?: EyeColorId };
export type CatalogItem = { id: StoreItemId; label: string; price: number; hex?: string; owned: boolean; wearing: boolean };
export type TabId = (typeof STORE_TABS)[number]['id'];

/** A tile: a catalog item, or a free part every kid already has (the board's "Classic" / own color). */
export type Tile = { key: string; label: string; price: number; owned: boolean; section: StoreSection; itemId: StoreItemId | null; patch: Partial<Look>; furniture?: FurnitureKindId };

const PART_OF: Record<StoreSection, keyof Look | null> = { furniture: null, sticker: 'sticker', color: 'hex', antenna: 'antenna', eyes: 'eyes', eyeColor: 'eyeColor' };

/** The look change a catalog item makes when worn. */
export function patchFor(item: { id: StoreItemId; hex?: string }): Partial<Look> {
  const section = storeSectionOf(item.id);
  const value = item.id.slice(item.id.indexOf(':') + 1);
  if (section === 'color') return { hex: item.hex };
  if (section === 'furniture') return {};
  return { [PART_OF[section] as string]: value } as Partial<Look>;
}

/** The free parts listed first on a tab (owned by everyone, never sold): Classic antenna, Classic eyes, and
 * the kid's own current shell color when it isn't a Store color. */
function freeTiles(tab: TabId, look: Look, catalogHexes: string[]): Tile[] {
  const d = STORE_RULES.freeLookDefaults;
  if (tab === 'antennas') return [{ key: 'antenna:classic', label: STORE_COPY.classic, price: 0, owned: true, section: 'antenna', itemId: null, patch: { antenna: d.antenna } }];
  if (tab === 'eyes') return [{ key: 'eyes:classic', label: STORE_COPY.classic, price: 0, owned: true, section: 'eyes', itemId: null, patch: { eyes: d.eyes, eyeColor: d.eyeColor } }];
  if (tab === 'colors' && !catalogHexes.includes(look.hex.toUpperCase())) return [{ key: 'color:mine', label: STORE_COPY.yours, price: 0, owned: true, section: 'color', itemId: null, patch: { hex: look.hex } }];
  return [];
}

export function tilesFor(tab: TabId, items: CatalogItem[], look: Look): Tile[] {
  const sections = STORE_TABS.find((t) => t.id === tab)?.sections ?? [];
  const inTab = items.filter((i) => sections.includes(storeSectionOf(i.id)));
  const hexes = items.filter((i) => i.hex).map((i) => i.hex!.toUpperCase());
  const sold = inTab.map(
    (i): Tile => ({
      key: i.id,
      label: i.label,
      price: i.price,
      owned: i.owned,
      section: storeSectionOf(i.id),
      itemId: i.id,
      patch: patchFor(i),
      furniture: storeSectionOf(i.id) === 'furniture' ? (i.id.slice(i.id.indexOf(':') + 1) as FurnitureKindId) : undefined,
    }),
  );
  return [...freeTiles(tab, look, hexes), ...sold];
}

/** The look with one tile tried on. Picking an eye color keeps the eye design, and vice versa. */
export function tryOn(look: Look, tile: Tile): Look {
  return { ...look, ...tile.patch };
}

/** Whether the MEGA is already wearing exactly what this tile changes. */
export function isWearing(look: Look, tile: Tile): boolean {
  if (tile.section === 'furniture') return false;
  const d = STORE_RULES.freeLookDefaults;
  const norm = (l: Look) => ({ hex: l.hex.toUpperCase(), sticker: l.sticker, antenna: l.antenna ?? d.antenna, eyes: l.eyes ?? d.eyes, eyeColor: l.eyeColor ?? d.eyeColor });
  const now = norm(look);
  const after = norm(tryOn(look, tile));
  return (Object.keys(now) as (keyof typeof now)[]).every((k) => now[k] === after[k]);
}

export type Bar = { kind: 'wearing' | 'inRoom' | 'wear' | 'buy' | 'short'; price: number; short: number; left: number };

export function barFor(tile: Tile, look: Look, balance: number): Bar {
  const base = { price: tile.price, short: Math.max(0, tile.price - balance), left: balance - tile.price };
  if (tile.section === 'furniture' && tile.owned) return { kind: 'inRoom', ...base };
  if (isWearing(look, tile)) return { kind: 'wearing', ...base };
  if (tile.owned) return { kind: 'wear', ...base };
  if (tile.price > balance) return { kind: 'short', ...base };
  return { kind: 'buy', ...base };
}

/** The tile the tab opens on: the first one not owned (what the kid can shop for), else the first. */
export function firstPick(tiles: Tile[]): string {
  return (tiles.find((t) => !t.owned) ?? tiles[0])?.key ?? '';
}
