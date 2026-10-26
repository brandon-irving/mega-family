// Rooms as data. A room is a tile grid (TILE art pixels per tile) with wall rows,
// furniture placed by tile, stations MEGAs walk to, and doors to members' rooms.
// Furniture art uses the same part shapes as the MEGA (see pixel-paint.mjs),
// in art pixels relative to the item's top-left tile.

import { flat, part } from "./pixel-paint.mjs";

export const TILE = 32;

export const ROOM_COLORS = {
  outline: "#1B1A3A",
  floor: "#E6C18F", floorSeam: "#C99C66", floorGrain: "#DDB47F",
  wall: "#F3EAD6", wallStripe: "#E7DCC2", baseboard: "#A47C57", wallTrim: "#8C6646",
  wood: "#B77B4B", woodDark: "#8A5A3A",
  paper: "#FFFFFF", red: "#E25B5B", glass: "#9FD8F2", green: "#6CBF6A", pot: "#C9734A",
  rug: "#F2A7B5", rugInner: "#F7C6CF", blue: "#5B8DEF", yellow: "#F2C94C",
  silver: "#C9CFDB", screen: "#7FE3F0", bezel: "#2A2F4A", fridge: "#F4F6FB",
  pad: "#2A2F4A", glow: "#9FF0F7", door: "#9A6A44", mat: "#9AA36B", night: "#1E2A5A", accent: "#8E6CE0",
};

const books = (y, xs, colors) => xs.map((x, i) => part(`book${y}_${i}`, "body", colors[i % colors.length], { rect: [x, y, 5, 16] }));

export const FURNITURE = {
  window: { size: [2, 2], parts: [
    part("frame", "body", "paper", { round: [6, 8, 52, 40, 1] }),
    part("glass", "body", "glass", { rect: [10, 12, 44, 32] }, { outline: false }),
    flat("mullionV", "body", "paper", { rect: [31, 12, 2, 32] }),
    flat("mullionH", "body", "paper", { rect: [10, 27, 44, 2] }),
    flat("glare", "body", "paper", { px: [[13, 15], [14, 15], [13, 16], [35, 15], [36, 15], [35, 16]] }),
    part("sill", "body", "wood", { rect: [4, 48, 56, 4] }),
  ] },
  calendar: { size: [1, 2], parts: [
    part("sheet", "body", "paper", { round: [3, 10, 26, 34, 1] }, { shade: false }),
    flat("band", "body", "red", { rect: [3, 10, 26, 8] }),
    flat("rings", "body", "outline", { px: [[9, 9], [9, 10], [22, 9], [22, 10]] }),
    flat("days", "body", "wallTrim", { pattern: [6, 21, ["#.#.#.#.#.#", "...........", "#.#.#.#.#.#", "...........", "#.#.#.#.#.#", "...........", "#.#.#.#.#.#"]] }),
    flat("today", "body", "red", { rect: [13, 26, 3, 3] }),
  ] },
  clock: { size: [1, 2], parts: [
    part("face", "body", "paper", { round: [8, 14, 16, 16, 4] }, { shade: false }),
    flat("hands", "body", "outline", { px: [[16, 18], [16, 19], [16, 20], [16, 21], [17, 22], [18, 22], [19, 22]] }),
  ] },
  bookshelf: { size: [2, 3], parts: [
    part("case", "body", "wood", { round: [2, 6, 60, 84, 1] }),
    flat("back", "body", "woodDark", { rect: [6, 10, 52, 76] }),
    flat("shelf1", "body", "wood", { rect: [6, 34, 52, 3] }),
    flat("shelf2", "body", "wood", { rect: [6, 60, 52, 3] }),
    ...books(17, [8, 14, 20, 28, 34, 46], ["blue", "yellow", "red", "green"]),
    ...books(43, [10, 16, 24, 30, 40, 50], ["red", "green", "blue", "yellow"]),
    ...books(69, [8, 18, 24, 36, 42, 52], ["yellow", "blue", "green", "red"]),
  ] },
  desk: { size: [2, 1], parts: [
    part("legL", "body", "woodDark", { rect: [4, 22, 4, 8] }, { shade: false }),
    part("legR", "body", "woodDark", { rect: [56, 22, 4, 8] }, { shade: false }),
    part("top", "body", "wood", { rect: [2, 6, 60, 16] }),
    part("monitor", "body", "bezel", { round: [6, -14, 22, 18, 1] }, { shade: false }),
    flat("screen", "body", "screen", { rect: [8, -12, 18, 13] }),
    flat("screenLines", "body", "bezel", { pattern: [10, -9, ["######......", "............", "##########..", "............", "#######....."]] }),
    part("stand", "body", "bezel", { rect: [15, 4, 4, 4] }, { shade: false }),
    part("papers", "body", "paper", { rect: [38, 9, 12, 8] }, { shade: false }),
    part("cup", "body", "red", { rect: [53, 6, 5, 7] }),
    flat("pencil", "body", "yellow", { rect: [55, 2, 1, 4] }),
  ] },
  fridge: { size: [1, 2], parts: [
    part("body", "body", "fridge", { round: [2, -6, 28, 68, 1] }),
    flat("split", "body", "outline", { rect: [3, 16, 26, 1] }),
    part("handleTop", "body", "silver", { rect: [5, 4, 2, 8] }, { shade: false }),
    part("handleBottom", "body", "silver", { rect: [5, 24, 2, 12] }, { shade: false }),
    flat("magnet1", "body", "red", { rect: [18, 2, 3, 3] }),
    flat("magnet2", "body", "blue", { rect: [22, 8, 3, 3] }),
    part("note", "body", "yellow", { rect: [16, 26, 8, 8] }, { shade: false }),
  ] },
  charger: { size: [1, 1], parts: [
    part("pad", "body", "pad", { round: [2, 14, 28, 16, 4] }, { shade: false }),
    flat("ring", "body", "glow", { round: [6, 17, 20, 10, 3] }),
    flat("core", "body", "pad", { round: [9, 19, 14, 6, 2] }),
  ] },
  rug: { size: [3, 3], parts: [
    part("rug", "body", "rug", { round: [4, 6, 88, 84, 6] }, { shade: false }),
    flat("inner", "body", "rugInner", { round: [10, 12, 76, 72, 5] }),
    part("blockA", "body", "red", { rect: [64, 16, 10, 10] }),
    part("blockB", "body", "blue", { rect: [76, 20, 10, 10] }),
    part("blockC", "body", "yellow", { rect: [69, 6, 10, 10] }),
    part("ball", "body", "green", { round: [16, 66, 12, 12, 3] }),
  ] },
  mailbox: { size: [1, 1], parts: [
    part("post", "body", "woodDark", { rect: [14, 22, 4, 8] }, { shade: false }),
    part("box", "body", "blue", { round: [6, 2, 20, 20, 3] }),
    flat("slot", "body", "outline", { rect: [10, 9, 12, 2] }),
    part("letter", "body", "paper", { rect: [12, 4, 8, 4] }, { shade: false, outline: false }),
    part("flag", "body", "red", { rect: [26, 4, 3, 7] }, { shade: false }),
  ] },
  plant: { size: [1, 1], parts: [
    part("pot", "body", "pot", { round: [9, 18, 14, 12, 2] }),
    part("leaves", "body", "green", { round: [5, 0, 22, 20, 5] }),
    flat("vein", "body", "greenDark", { px: [[16, 6], [16, 7], [16, 8], [16, 9], [16, 10], [16, 11], [13, 9], [19, 8]] }),
  ] },
  frontDoor: { size: [2, 1], parts: [
    part("frame", "body", "wood", { rect: [4, 0, 56, 32] }, { shade: false }),
    part("left", "body", "door", { rect: [8, 4, 23, 28] }),
    part("right", "body", "door", { rect: [33, 4, 23, 28] }),
    flat("paneL", "body", "glass", { rect: [13, 8, 13, 8] }),
    flat("paneR", "body", "glass", { rect: [38, 8, 13, 8] }),
    flat("knobs", "body", "yellow", { px: [[28, 20], [36, 20]] }),
  ] },
  table: { size: [2, 1], parts: [
    part("legL", "body", "woodDark", { rect: [8, 20, 4, 9] }, { shade: false }),
    part("legR", "body", "woodDark", { rect: [52, 20, 4, 9] }, { shade: false }),
    part("top", "body", "wood", { round: [4, 4, 56, 17, 2] }),
    part("bowl", "body", "paper", { round: [24, 4, 16, 7, 2] }, { shade: false }),
    part("apple", "body", "red", { round: [26, -1, 6, 6, 1] }),
    part("lemon", "body", "yellow", { round: [32, -2, 6, 6, 1] }),
    part("lime", "body", "green", { round: [29, -5, 5, 5, 1] }),
  ] },
  // Personal-room items. "accent" is the colour the owner picks.
  bed: { size: [1, 2], parts: [
    part("frame", "body", "wood", { round: [2, 0, 28, 62, 1] }),
    part("pillow", "body", "paper", { round: [5, 4, 22, 10, 2] }, { shade: false }),
    part("blanket", "body", "accent", { rect: [3, 20, 26, 40] }),
    flat("fold", "body", "accentLight", { rect: [3, 20, 26, 4] }),
  ] },
  lamp: { size: [1, 1], parts: [
    part("base", "body", "woodDark", { round: [10, 24, 12, 6, 1] }, { shade: false }),
    part("pole", "body", "silver", { rect: [15, 8, 2, 16] }, { shade: false }),
    part("shade", "body", "accent", { round: [7, -2, 18, 12, 2] }),
  ] },
  beanbag: { size: [1, 1], parts: [
    part("bag", "body", "accent", { round: [3, 8, 26, 22, 6] }),
    flat("dent", "body", "accentDark", { round: [10, 14, 12, 7, 2] }),
  ] },
  toybox: { size: [1, 1], parts: [
    part("box", "body", "accent", { rect: [3, 12, 26, 18] }),
    part("lid", "body", "accentDark", { rect: [2, 6, 28, 6] }, { shade: false }),
    flat("star", "body", "paper", { pattern: [14, 17, [".#.", "###", "#.#"]] }),
  ] },
  rugSmall: { size: [2, 2], parts: [
    part("rug", "body", "accent", { round: [4, 4, 56, 56, 5] }, { shade: false }),
    flat("inner", "body", "accentLight", { round: [10, 10, 44, 44, 4] }),
  ] },
  poster: { size: [1, 2], parts: [
    part("frame", "body", "accent", { rect: [4, 10, 24, 30] }, { shade: false }),
    flat("sky", "body", "night", { rect: [7, 13, 18, 24] }),
    flat("stars", "body", "yellow", { px: [[9, 15], [21, 16], [12, 21], [23, 24], [9, 33]] }),
    flat("planet", "body", "green", { round: [15, 26, 8, 8, 2] }),
    flat("ring", "body", "paper", { rect: [13, 30, 12, 1] }),
    flat("rocket", "body", "red", { px: [[11, 26], [11, 27], [12, 25], [12, 26], [12, 27], [13, 26]] }),
  ] },
  mat: { size: [2, 1], parts: [part("mat", "body", "mat", { round: [10, 14, 44, 14, 2] }, { shade: false })] },
};

/** A member's door: the frame and plaque take that member's MEGA colour and decal. */
export function memberDoor(colorKey, decalRows) {
  return { size: [1, 1], parts: [
    part("frame", "body", colorKey, { rect: [3, 0, 26, 32] }, { shade: false }),
    part("door", "body", "door", { rect: [7, 4, 18, 28] }),
    part("plaque", "body", "paper", { rect: [12, 8, 8, 7] }, { shade: false }),
    flat("decal", "body", colorKey, { pattern: [14, 10, decalRows] }),
    flat("knob", "body", "yellow", { px: [[21, 20], [21, 21]] }),
  ] };
}

// The shared family room. Tiles: x 0..cols-1, y 0..rows-1. Wall rows are not walkable.
export const HQ = {
  cols: 10, rows: 13,
  walls: { top: 2, bottom: 1 },
  items: [
    { kind: "window", tile: [1, 0] },
    { kind: "calendar", tile: [4, 0] },
    { kind: "clock", tile: [5, 0] },
    { kind: "bookshelf", tile: [7, 0], blocks: [[7, 2], [8, 2]] },
    { kind: "plant", tile: [0, 2], blocks: [[0, 2]] },
    { kind: "desk", tile: [1, 2], blocks: [[1, 2], [2, 2]] },
    { kind: "fridge", tile: [9, 3], blocks: [[9, 3], [9, 4]] },
    { kind: "table", tile: [5, 4], blocks: [[5, 4], [6, 4]] },
    { kind: "charger", tile: [5, 7] },
    { kind: "rug", tile: [1, 8] },
    { kind: "mailbox", tile: [8, 9], blocks: [[8, 9]] },
    { kind: "plant", tile: [9, 11], blocks: [[9, 11]] },
    { kind: "mat", tile: [4, 11] },
    { kind: "frontDoor", tile: [4, 12] },
  ],
  // Where a MEGA stands for each kind of work, and which way it faces.
  stations: {
    desk: { tile: [1, 3], face: "back", label: "Desk", hit: [1, 2, 2, 1] },
    calendar: { tile: [4, 2], face: "back", label: "Calendar", hit: [4, 0, 1, 2] },
    bookshelf: { tile: [7, 3], face: "back", label: "Bookshelf", hit: [7, 0, 2, 3] },
    fridge: { tile: [8, 4], face: "right", label: "Fridge", hit: [9, 3, 1, 2] },
    charger: { tile: [5, 7], face: "front", label: "Charger", hit: [5, 7, 1, 1] },
    rug: { tile: [2, 9], face: "front", label: "Toy rug", hit: [1, 8, 3, 3] },
    mailbox: { tile: [8, 10], face: "back", label: "Mailbox", hit: [8, 9, 1, 1] },
    frontDoor: { tile: [4, 11], face: "front", label: "Front door", hit: [4, 12, 2, 1] },
  },
  // Member doors sit in the bottom wall, in member order.
  doorTiles: [[1, 12], [2, 12], [7, 12], [8, 12]],
};

// Personal rooms: what the owner can place, and the colours on offer.
export const ROOM_COLORS_ON_OFFER = ["#8E6CE0", "#5B8DEF", "#6CBF6A", "#F2766B"];
export const WALL_COLORS = [
  { name: "Cream", wall: "#F3EAD6", wallStripe: "#E7DCC2" },
  { name: "Mint", wall: "#DDF1E4", wallStripe: "#CBE6D4" },
  { name: "Lilac", wall: "#E9E1F8", wallStripe: "#DACFF0" },
];

// layer: "wall" items hang on the top wall; "rug" items lie under everything and don't block;
// "floor" items block their footprint. station: where the MEGA stands to use it.
export const DECOR = {
  bed: { label: "Bed", layer: "floor", colorable: true, station: { offset: [1, 1], face: "left", does: "resting on the bed" } },
  desk: { label: "Desk", layer: "floor", colorable: false, station: { offset: [0, 1], face: "back", does: "reading at the desk" } },
  lamp: { label: "Lamp", layer: "floor", colorable: true },
  beanbag: { label: "Beanbag", layer: "floor", colorable: true, station: { offset: [0, 1], face: "back", does: "relaxing by the beanbag" } },
  toybox: { label: "Toy box", layer: "floor", colorable: true, station: { offset: [1, 0], face: "left", does: "digging through the toy box" } },
  rugSmall: { label: "Rug", layer: "rug", colorable: true, station: { offset: [1, 1], face: "front", does: "playing on the rug" } },
  plant: { label: "Plant", layer: "floor", colorable: false },
  poster: { label: "Poster", layer: "wall", colorable: true },
};

export const MY_ROOM = {
  cols: 8, rows: 9,
  walls: { top: 2, bottom: 1 },
  fixed: [{ kind: "window", tile: [5, 0] }],
  exitTile: [3, 8],
  items: [
    { kind: "poster", tile: [1, 0], color: 0 },
    { kind: "bed", tile: [0, 2], color: 0 },
    { kind: "lamp", tile: [1, 2], color: 3 },
    { kind: "desk", tile: [5, 2] },
    { kind: "rugSmall", tile: [2, 4], color: 1 },
    { kind: "beanbag", tile: [6, 5], color: 2 },
    { kind: "toybox", tile: [0, 6], color: 3 },
    { kind: "plant", tile: [7, 7] },
  ],
};

// Stand-in for a Muse Image poster in mockups (the real one is generated).
export const POSTER_PLACEHOLDER = { size: [60, 80], parts: [
  flat("sky", "body", "night", { rect: [0, 0, 60, 80] }),
  flat("stars", "body", "yellow", { px: [[6, 8], [50, 5], [30, 14], [12, 30], [54, 26], [8, 62], [44, 70], [22, 52], [56, 48], [36, 4]] }),
  part("planet", "body", "green", { round: [26, 30, 22, 22, 6] }),
  flat("ring", "body", "paper", { rect: [18, 41, 38, 2] }),
  part("rocketBody", "body", "paper", { round: [10, 46, 8, 18, 2] }),
  part("nose", "body", "red", { round: [11, 40, 6, 7, 2] }),
  flat("window", "body", "glass", { rect: [12, 50, 4, 4] }),
  part("finL", "body", "red", { rect: [7, 58, 3, 6] }, { shade: false }),
  part("finR", "body", "red", { rect: [18, 58, 3, 6] }, { shade: false }),
  flat("flame", "body", "yellow", { px: [[13, 65], [14, 65], [13, 66], [14, 66], [13, 67]] }),
] };
