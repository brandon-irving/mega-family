// The MEGA body as data. Coordinates are art pixels on a 32x40 grid.
// Shapes: { rect: [x, y, w, h] }, { round: [x, y, w, h, r] } (corners cut by r),
// { px: [[x, y], ...] }, { pattern: [x, y, rows] } ("#" = filled).
// Parts draw in order; each outlined part gets a 1px navy border drawn over
// whatever is beneath it, which is what separates an arm from the torso.

import { flat, part, withShades } from "./pixel-paint.mjs";

export const GRID = { w: 32, h: 40 };

export const FIXED_COLORS = {
  outline: "#1B1A3A",
  visor: "#17143A",
  glare: "#BFEAF7",
  white: "#F4F6FB", whiteLight: "#FFFFFF", whiteDark: "#AEB3CC",
  silver: "#C9CFDB", silverLight: "#E8EBF2", silverDark: "#8E95AB",
  tip: "#9FF0F7", tipLight: "#F0FFFF", tipDark: "#5FCFE0",
  eye: "#E8FFFF",
  blush: "#FF9AB2",
};


// Antenna shapes (bought in the Store). Every part id starts with "antenna" and stays above row 8
// (the head's top edge), so a renderer can swap the antenna without touching the rest of the body.
// "classic" is the default every MEGA starts with.
export const ANTENNAS = {
  classic: [
    part("antennaStem", "body", "silver", { rect: [15, 4, 2, 4] }),
    part("antennaTip", "body", "tip", { round: [14, 1, 4, 3, 1] }),
  ],
  twin: [
    part("antennaStemL", "body", "silver", { rect: [10, 4, 2, 4] }),
    part("antennaStemR", "body", "silver", { rect: [20, 4, 2, 4] }),
    part("antennaTipL", "body", "tip", { round: [9, 1, 4, 3, 1] }),
    part("antennaTipR", "body", "tip", { round: [19, 1, 4, 3, 1] }),
  ],
  star: [
    part("antennaStem", "body", "silver", { rect: [15, 6, 2, 2] }),
    part("antennaStar", "body", "star", { pattern: [13, 1, ["..#..", ".###.", "#####", ".###.", ".#.#."]] }),
  ],
  sprout: [
    part("antennaStem", "body", "sprout", { rect: [15, 4, 2, 4] }),
    part("antennaLeafL", "body", "sprout", { pattern: [11, 2, ["##..", "###.", ".###"]] }),
    part("antennaLeafR", "body", "sprout", { pattern: [17, 1, ["..##", ".###", "###."]] }),
  ],
};
const antenna = ANTENNAS.classic;
// Colours only Store parts use (with their light and dark shades), kept apart from FIXED_COLORS.
// The anime* colours come from the Muse Image eyes (see ANIME_EYE below).
export const STORE_COLORS = withShades({
  star: "#FFD54A", sprout: "#5BBF6A",
  animeBlue: "#0157B7", animeTeal: "#02A0BC", animeCyan: "#00CCC6", animeAqua: "#00F2CF", animePupil: "#15123D", animeShine: "#FFFFFF",
});

// Eye colours (bought in the Store) recolour the standard eyes in every expression: a renderer swaps
// the "eye" palette entry, so open, happy, wink and closed all follow. "classic" is the default.
export const EYE_COLORS = { classic: FIXED_COLORS.eye, pink: "#FF9AD5", gold: "#FFD54A", mint: "#7DF2B0", lilac: "#C7A6FF", ember: "#FF8A5B" };

// Anime eyes: made once with Muse Image (Oct 27; source design/mega-screens/assets/looks/source/
// anime-eyes-muse.png) and downscaled to the visor grid, one 7x6 eye drawn twice. Each letter is a
// palette key; "." is the visor showing through (the generated lash line is dark, so it is dropped).
export const ANIME_EYE = {
  at: [[8, 14], [17, 14]],
  rows: ["..bbb..", ".bbpwbb", "ttppwtt", "ccpppcc", ".aacaa.", "..aaa.."],
  keys: { b: "animeBlue", t: "animeTeal", c: "animeCyan", a: "animeAqua", p: "animePupil", w: "animeShine" },
};
/** ANIME_EYE as one-colour patterns per palette key, at both eye positions. */
function animeFront() {
  return ANIME_EYE.at.flatMap(([x, y]) => Object.entries(ANIME_EYE.keys).map(([ch, fill]) => ({
    fill, shape: { pattern: [x, y, ANIME_EYE.rows.map((r) => [...r].map((c) => (c === ch ? "#" : ".")).join(""))] },
  })));
}

// Eye designs (bought in the Store) replace only the resting "open" eyes; other expressions keep
// their own. "classic" is the default. A design's `paint` pieces carry their own palette key.
export const EYE_STYLES = {
  classic: { front: [{ rect: [11, 15, 2, 3] }, { rect: [19, 15, 2, 3] }], side: [{ rect: [23, 15, 1, 3] }] },
  anime: { front: [], paint: animeFront(), side: [{ rect: [23, 15, 1, 3] }] },
};

export const VIEWS = {
  front: [
    part("legL", "legL", "shell", { rect: [12, 31, 2, 4] }),
    part("legR", "legR", "shell", { rect: [18, 31, 2, 4] }),
    part("bootL", "legL", "white", { round: [10, 35, 5, 3, 1] }),
    part("bootR", "legR", "white", { round: [17, 35, 5, 3, 1] }),
    part("armL", "body", "shell", { rect: [7, 27, 3, 2] }),
    part("armR", "body", "shell", { rect: [22, 27, 3, 2] }),
    part("mittenL", "body", "white", { round: [4, 27, 4, 4, 1] }),
    part("mittenR", "body", "white", { round: [24, 27, 4, 4, 1] }),
    part("torso", "body", "shell", { round: [10, 26, 12, 6, 1] }),
    part("chest", "body", "white", { rect: [13, 28, 6, 2] }),
    part("earL", "body", "shell", { round: [1, 13, 3, 7, 1] }),
    part("earR", "body", "shell", { round: [28, 13, 3, 7, 1] }),
    ...antenna,
    part("head", "body", "shell", { round: [4, 8, 24, 18, 2] }),
    flat("visor", "body", "visor", { round: [7, 11, 18, 12, 1] }),
    flat("glare", "body", "glare", { px: [[10, 12], [11, 12], [12, 12], [9, 13], [9, 14]] }),
  ],
  back: [
    part("legL", "legL", "shell", { rect: [12, 31, 2, 4] }),
    part("legR", "legR", "shell", { rect: [18, 31, 2, 4] }),
    part("bootL", "legL", "white", { round: [10, 35, 5, 3, 1] }),
    part("bootR", "legR", "white", { round: [17, 35, 5, 3, 1] }),
    part("armL", "body", "shell", { rect: [7, 27, 3, 2] }),
    part("armR", "body", "shell", { rect: [22, 27, 3, 2] }),
    part("mittenL", "body", "white", { round: [4, 27, 4, 4, 1] }),
    part("mittenR", "body", "white", { round: [24, 27, 4, 4, 1] }),
    part("torso", "body", "shell", { round: [10, 26, 12, 6, 1] }),
    part("earL", "body", "shell", { round: [1, 13, 3, 7, 1] }),
    part("earR", "body", "shell", { round: [28, 13, 3, 7, 1] }),
    ...antenna,
    part("head", "body", "shell", { round: [4, 8, 24, 18, 2] }),
    part("backPanel", "body", "shellDark", { round: [9, 12, 14, 10, 1] }, { shade: false }),
    flat("vent1", "body", "outline", { rect: [12, 15, 8, 1] }),
    flat("vent2", "body", "outline", { rect: [12, 18, 8, 1] }),
  ],
  // Facing right; "left" is this view mirrored.
  side: [
    part("legBack", "legB", "shellDark", { rect: [13, 31, 2, 4] }, { shade: false }),
    part("bootBack", "legB", "white", { round: [12, 35, 5, 3, 1] }),
    part("legFront", "legF", "shell", { rect: [17, 31, 2, 4] }),
    part("bootFront", "legF", "white", { round: [16, 35, 6, 3, 1] }),
    part("torso", "body", "shell", { round: [11, 26, 10, 6, 1] }),
    ...antenna,
    part("head", "body", "shell", { round: [8, 8, 16, 18, 2] }),
    flat("visorEdge", "body", "visor", { rect: [22, 11, 2, 12] }),
    part("ear", "body", "shell", { round: [12, 13, 5, 6, 1] }),
    part("arm", "arm", "shell", { rect: [15, 27, 2, 2] }),
    part("mitten", "arm", "white", { round: [14, 28, 4, 4, 1] }),
  ],
};

// Per-frame offsets by part group: [dx, dy]. A step lifts the body one pixel
// and one foot with it, like the Game Boy overworld walk.
export const FRAMES = {
  front: { stand: {}, stepL: { body: [0, -1], legL: [0, -1] }, stepR: { body: [0, -1], legR: [0, -1] } },
  back: { stand: {}, stepL: { body: [0, -1], legL: [0, -1] }, stepR: { body: [0, -1], legR: [0, -1] } },
  side: {
    stand: {},
    stepL: { body: [0, -1], arm: [-1, -1], legF: [1, 0], legB: [-1, 0] },
    stepR: { body: [0, -1], arm: [1, -1], legF: [-1, 0], legB: [1, 0] },
  },
};

// Eyes drawn on the visor. Front and side views each have their own layout.
export const EXPRESSIONS = {
  blank: { front: [], side: [] },
  open: {
    front: [{ rect: [11, 15, 2, 3] }, { rect: [19, 15, 2, 3] }],
    side: [{ rect: [23, 15, 1, 3] }],
  },
  closed: {
    front: [{ rect: [10, 17, 4, 1] }, { rect: [18, 17, 4, 1] }],
    side: [{ rect: [22, 17, 2, 1] }],
  },
  happy: {
    front: [{ px: [[10, 17], [11, 16], [12, 16], [13, 17], [18, 17], [19, 16], [20, 16], [21, 17]] }],
    side: [{ px: [[22, 17], [23, 16]] }],
    blush: [{ rect: [8, 19, 2, 1] }, { rect: [22, 19, 2, 1] }],
  },
  // Soft, half-lidded eyes.
  calm: {
    front: [{ rect: [11, 16, 2, 2] }, { rect: [19, 16, 2, 2] }],
    side: [{ rect: [23, 16, 1, 2] }],
  },
  // One eye open, one smiling.
  wink: {
    front: [{ rect: [11, 15, 2, 3] }, { px: [[18, 17], [19, 16], [20, 16], [21, 17]] }],
    side: [{ rect: [23, 15, 1, 3] }],
  },
};

// Personality presets: each sets the resting face; speech style lives in prompt config.
export const PERSONALITIES = {
  calm: { label: "Calm", face: "calm", blurb: "Gentle and unhurried", sample: "No rush. Practice is at 5:30, and I'll remind you at 4:50." },
  cheerful: { label: "Cheerful", face: "happy", blurb: "Upbeat and encouraging", sample: "Good news! Practice is at 5:30. Want a reminder at 4:50?" },
  funny: { label: "Funny", face: "wink", blurb: "Light jokes, still useful", sample: "Practice at 5:30. I'll ping you at 4:50, before traffic does." },
  brief: { label: "Brief", face: "open", blurb: "Short and to the point", sample: "Practice 5:30. Reminder at 4:50?" },
};

// Shell colours on offer when creating or restyling a MEGA.
export const SHELL_COLORS = {
  teal: "#2FB8B0", coral: "#F2766B", violet: "#8E6CE0", sun: "#F2B33D", sky: "#5B8DEF", leaf: "#5BBF6A",
};

// Signature decals: 3x3 flat paint on the top-right corner of the head bezel.
export const DECAL_ANCHOR = [22, 8];
export const DECALS = {
  star: [".#.", "###", "#.#"],
  heart: ["#.#", "###", ".#."],
  leaf: [".##", "###", "##."],
  bolt: [".##", ".#.", "##."],
};

// The badge sits on a white tile so the navy outline reads on dark themes.
export const BADGE = { pad: 2, background: "#FFFFFF" };
export const BADGE_PARTS = ["earL", "earR", "antennaStem", "antennaTip", "head", "visor", "glare", "decal", "eyes", "blush"];

// Stickers replace the 3x3 decals: a small image (made by Muse Image in the app) placed at
// this anchor on the head. size is the sticker's box in art pixels, including its border.
export const STICKER = { anchor: [20, 3], size: [12, 12] };
// Code-drawn stand-ins used by mockups until the Muse stickers exist (8x8 cores).
export const STICKER_STANDINS = {
  star: { color: "#FFD54A", rows: ["...##...", "...##...", "########", ".######.", "..####..", ".######.", ".##..##.", "##....##"] },
  heart: { color: "#FF6B8B", rows: ["........", ".##..##.", "########", "########", "########", ".######.", "..####..", "...##..."] },
  leaf: { color: "#5BBF6A", rows: ["....####", "..######", ".#######", ".######.", ".#####..", ".###....", "##......", "#......."] },
  bolt: { color: "#FFB020", rows: ["....###.", "...###..", "..###...", ".######.", "...###..", "..###...", ".##.....", "#......."] },
};
