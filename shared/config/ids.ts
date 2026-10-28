// Id lists that domain validators check membership against. Kept import-free so shared/domain can use
// them without a cycle; the richer config (labels, art, sets) lives in the sibling files and is typed by these.
export const STICKERS = ['star', 'heart', 'leaf', 'bolt', 'none'] as const;
export const WALLPAPER_PRESET_IDS = ['glow', 'night', 'dawn', 'room'] as const;
export const BUTTON_SET_IDS = ['reminder.default', 'request.default', 'tip.default', 'update.default', 'chore.default'] as const;

// GD (CONTRACT v0.13): MEGA look parts sold in the Store. 'classic' is everyone's default and always free.
// The art for each lives in the sprite engine (prototypes/megasprite/mega-template.mjs ANTENNAS / EYE_STYLES
// / EYE_COLORS); prices and labels live in ./store.ts.
export const ANTENNA_IDS = ['classic', 'twin', 'star', 'sprout'] as const;
export const EYE_STYLE_IDS = ['classic', 'anime'] as const;
export const EYE_COLOR_IDS = ['classic', 'pink', 'gold', 'mint', 'lilac', 'ember'] as const;

/** GD: a kid's two daily checklists (./kids.ts ROUTINES). */
export const ROUTINE_KINDS = ['morning', 'bedtime'] as const;

/** Furniture kinds the Store sells or gives free. G5's room config adds the rest (HQ-only pieces). */
export const STORE_FURNITURE_IDS = ['bed', 'desk', 'lamp', 'rugSmall', 'plant', 'toybox', 'beanbag'] as const;
/** Store-only shell colors (the six preset colors in ./looks.ts COLORS are free for everyone). */
export const STORE_SHELL_IDS = ['bubblegum', 'lime', 'lava', 'ocean', 'cocoa'] as const;

/** Every Store item id, `<section>:<id>` (one id space so purchases and the catalog share one key). Written
 * out rather than derived so the validator gets a literal tuple; tests/store.test.ts checks it against the
 * id lists above. */
export const STORE_ITEM_IDS = [
  'furniture:bed', 'furniture:desk', 'furniture:lamp', 'furniture:rugSmall', 'furniture:plant', 'furniture:toybox', 'furniture:beanbag',
  'sticker:star', 'sticker:heart', 'sticker:leaf', 'sticker:bolt',
  'color:bubblegum', 'color:lime', 'color:lava', 'color:ocean', 'color:cocoa',
  'antenna:twin', 'antenna:star', 'antenna:sprout',
  'eyes:anime',
  'eyeColor:pink', 'eyeColor:gold', 'eyeColor:mint', 'eyeColor:lilac', 'eyeColor:ember',
] as const;
