// Id lists that domain validators check membership against. Kept import-free so shared/domain can use
// them without a cycle; the richer config (labels, art, sets) lives in the sibling files and is typed by these.
export const STICKERS = ['star', 'heart', 'leaf', 'bolt', 'none'] as const;
export const WALLPAPER_PRESET_IDS = ['glow', 'night', 'dawn', 'room'] as const;
export const BUTTON_SET_IDS = ['reminder.default', 'request.default', 'tip.default', 'update.default'] as const;
