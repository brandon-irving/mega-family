// What a person may pick in the MEGA look picker (owner, Oct 28: customize from the profile, including the
// Store parts they own). Adults: everything (ROLES_CONFIG[role].profile.allLooks; their looks are free).
// Kids: the free basics (STORE_RULES: preset colors, `classic` parts, "no sticker"), whatever their MEGA wears
// now, and what they bought. The server checks the same rule on `megas.update` (assertKidMayWear).
import { ANTENNA_IDS, EYE_COLOR_IDS, EYE_STYLE_IDS, STICKERS } from '@shared/config/ids';
import { COLORS, type StickerId } from '@shared/config/looks';
import { ROLES_CONFIG } from '@shared/config/roles';
import { STORE_CATALOG, STORE_RULES, storeSectionOf, type AntennaId, type EyeColorId, type EyeStyleId, type StoreItemId } from '@shared/config/store';
import type { Role } from '@shared/domain/enums';

/** `customColor`: any hex (adults); kids pick from their colors only. */
export type Wardrobe = { colors: string[]; customColor: boolean; stickers: StickerId[]; antennas: AntennaId[]; eyes: EyeStyleId[]; eyeColors: EyeColorId[] };
type Current = { hex: string; sticker: StickerId; antenna?: AntennaId; eyes?: EyeStyleId; eyeColor?: EyeColorId };

const STORE_COLORS = (Object.keys(STORE_CATALOG) as StoreItemId[]).filter((id) => storeSectionOf(id) === 'color');
const hexOf = (id: StoreItemId) => (STORE_CATALOG[id] as { hex?: string }).hex as string;

/** `owned`: the kid's bought Store items (null while loading or for adults). */
export function wardrobeFor(role: Role, owned: readonly StoreItemId[] | null, current: Current): Wardrobe {
  const presets = Object.values(COLORS) as string[];
  if (ROLES_CONFIG[role].profile.allLooks)
    return { colors: [...presets, ...STORE_COLORS.map(hexOf)], customColor: true, stickers: [...STICKERS], antennas: [...ANTENNA_IDS], eyes: [...EYE_STYLE_IDS], eyeColors: [...EYE_COLOR_IDS] };

  const mine = new Set(owned ?? []);
  const has = (section: string, part: string) => mine.has(`${section}:${part}` as StoreItemId);
  const free = STORE_RULES.freeLookDefaults;
  const keep = <T extends string>(all: readonly T[], section: string, base: T, wearing?: T) => all.filter((p) => p === base || p === wearing || has(section, p));
  const colors = [...presets, ...STORE_COLORS.filter((id) => mine.has(id)).map(hexOf)];
  if (!colors.some((c) => c.toUpperCase() === current.hex.toUpperCase())) colors.push(current.hex);
  return {
    colors,
    customColor: false,
    stickers: STICKERS.filter((s) => s === 'none' || s === current.sticker || has('sticker', s)),
    antennas: keep(ANTENNA_IDS, 'antenna', free.antenna, current.antenna),
    eyes: keep(EYE_STYLE_IDS, 'eyes', free.eyes, current.eyes),
    eyeColors: keep(EYE_COLOR_IDS, 'eyeColor', free.eyeColor, current.eyeColor),
  };
}

/** A part's display name: the Store's label, or "Classic" for the free default. */
export function partLabel(section: 'antenna' | 'eyes' | 'eyeColor' | 'sticker', part: string): string {
  if (part === 'classic') return 'Classic';
  if (part === 'none') return 'None';
  const entry = STORE_CATALOG[`${section}:${part}` as StoreItemId] as { label: string } | undefined;
  return entry?.label ?? part;
}

