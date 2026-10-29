// Id lists that domain validators check membership against. Kept import-free so shared/domain can use
// them without a cycle; the richer config (labels, art, sets) lives in the sibling files and is typed by these.
export const STICKERS = ['star', 'heart', 'leaf', 'bolt', 'none'] as const;
export const WALLPAPER_PRESET_IDS = ['glow', 'night', 'dawn', 'room'] as const;
export const BUTTON_SET_IDS = ['reminder.default', 'request.default', 'tip.default', 'update.default', 'chore.default', 'holiday.default', 'price.default'] as const;

// GD (CONTRACT v0.13): MEGA look parts sold in the Store. 'classic' is everyone's default and always free.
// The art for each lives in the sprite engine (prototypes/megasprite/mega-template.mjs ANTENNAS / EYE_STYLES
// / EYE_COLORS); prices and labels live in ./store.ts.
export const ANTENNA_IDS = ['classic', 'twin', 'star', 'sprout'] as const;
export const EYE_STYLE_IDS = ['classic', 'anime'] as const;
export const EYE_COLOR_IDS = ['classic', 'pink', 'gold', 'mint', 'lilac', 'ember'] as const;

/** GD: a kid's two daily checklists (./kids.ts ROUTINES). */
export const ROUTINE_KINDS = ['morning', 'bedtime'] as const;

/** G4 (CONTRACT v0.15): a family place's kind (./integrations.ts PLACES). `other` is any custom label. */
export const PLACE_KINDS = ['home', 'school', 'work', 'other'] as const;
/** G4: NWS CAP severities (api.weather.gov alerts `properties.severity`), most severe first. */
export const ALERT_SEVERITIES = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'] as const;
/** G4: what a web search did with a query (./kidSafety.ts KID_SAFETY.search for kids). */
export const SEARCH_OUTCOMES = ['answered', 'rephrased', 'blocked', 'failed'] as const;
/** G4: why an integration couldn't answer. `not_configured` = its secret (e.g. MAPBOX_TOKEN) isn't set. */
export const INTEGRATION_FAILURES = ['not_configured', 'no_result', 'rate_limited', 'error'] as const;
/** G4b (CONTRACT v0.16): which weather tip an event got ("Rain at pickup", "UV is high during soccer", "Air
 * quality is poor during soccer"). Part of the tip's dedupe key: one per event × tip × day. */
export const WEATHER_TIPS = ['rain', 'uv', 'air'] as const;
/** G4b: a holiday question's state (`routineSkips.status`). `asked` until an adult answers. */
export const ROUTINE_SKIP_STATUSES = ['asked', 'paused', 'kept'] as const;
/** G4b: a price watch's state (`priceWatches.status`). */
export const PRICE_WATCH_STATUSES = ['watching', 'stopped'] as const;
/** G4: how a place's coordinates were found. `seed` = the sample family's fixed public landmarks. */
export const GEOCODE_STATUSES = ['pending', 'ok', 'failed', 'not_configured', 'seed'] as const;

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
