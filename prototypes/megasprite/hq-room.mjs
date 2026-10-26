// Renders rooms from hq-template data to pixel pictures, and works out the walkable grid.
// members: [{ id, spec }] in door order (spec as in renderMega).
import { DECALS } from "./mega-template.mjs";
import { FURNITURE, ROOM_COLORS, TILE, memberDoor } from "./hq-template.mjs";
import { blank, paint, withShades } from "./pixel-paint.mjs";

function drawFloor(pic, pal, y0, y1) {
  const { w, px } = pic;
  for (let y = y0; y < y1; y++) {
    const row = Math.floor((y - y0) / 8), inRow = (y - y0) % 8;
    for (let x = 0; x < w; x++) {
      const seamX = (x + row * 40) % (TILE * 3) === 0;
      px[y * w + x] = inRow === 7 || seamX ? pal.floorSeam : (x * 7 + row * 13) % 23 === 0 ? pal.floorGrain : pal.floor;
    }
  }
}

function drawWall(pic, pal, y0, y1, trimAt) {
  const { w, px } = pic;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < w; x++) {
      const fromTrim = trimAt === "bottom" ? y1 - 1 - y : y - y0;
      px[y * w + x] = fromTrim < 1 ? pal.outline : fromTrim < 2 ? pal.wallTrim : fromTrim < 6 ? pal.baseboard : x % 8 < 2 ? pal.wallStripe : pal.wall;
    }
}

function border(pic, pal) {
  const { w, h, px } = pic;
  for (let x = 0; x < w; x++) { px[x] = pal.outline; px[(h - 1) * w + x] = pal.outline; }
  for (let y = 0; y < h; y++) { px[y * w] = pal.outline; px[y * w + w - 1] = pal.outline; }
}

const roomPalette = (overrides = {}) => withShades({ ...ROOM_COLORS, ...overrides });
const memberColors = (members) => Object.fromEntries(members.map((m) => [`member_${m.id}`, m.spec.shell]));
const doorFor = (m) => memberDoor(`member_${m.id}`, DECALS[m.spec.decal] ?? DECALS.star);

/** Walls, floor and the given placed art ({ art, tile }), drawn back to front. */
function renderShell(room, pal, placed) {
  const W = room.cols * TILE, H = room.rows * TILE;
  const pic = blank(W, H);
  const floorTop = room.walls.top * TILE, floorBottom = H - room.walls.bottom * TILE;
  drawWall(pic, pal, 0, floorTop, "bottom");
  drawFloor(pic, pal, floorTop, floorBottom);
  drawWall(pic, pal, floorBottom, H, "top");
  for (const { art, tile } of [...placed].sort((a, b) => a.tile[1] - b.tile[1]))
    paint(pic, art.parts, pal, { origin: [tile[0] * TILE, tile[1] * TILE] });
  border(pic, pal);
  return pic;
}

/** The shared HQ: furniture plus one door per member. */
export function renderRoom(room, members = []) {
  const pal = roomPalette(memberColors(members));
  const doors = members.map((m, i) => ({ art: doorFor(m), tile: room.doorTiles[i] }));
  return renderShell(room, pal, [...room.items.map((it) => ({ art: FURNITURE[it.kind], tile: it.tile })), ...doors]);
}

/** A personal room without its movable items: walls in the chosen colour, fixed items, exit door. */
export function renderRoomBase(room, owner, wallColor = {}) {
  const pal = roomPalette({ ...memberColors([owner]), wall: wallColor.wall, wallStripe: wallColor.wallStripe });
  const fixed = room.fixed.map((it) => ({ art: FURNITURE[it.kind], tile: it.tile }));
  return renderShell(room, pal, [...fixed, { art: doorFor(owner), tile: room.exitTile }]);
}

/** One movable item on its own transparent picture, one tile of headroom above for overhang. */
export function renderItem(kind, accent) {
  const art = FURNITURE[kind];
  const pal = roomPalette(accent ? { accent } : {});
  return paint(blank(art.size[0] * TILE, (art.size[1] + 1) * TILE), art.parts, pal, { origin: [0, TILE] });
}

/** walkable[y][x]: floor rows minus tiles that furniture blocks. */
export function walkable(room) {
  const blocked = new Set(room.items.flatMap((it) => it.blocks ?? []).map(([x, y]) => `${x},${y}`));
  return Array.from({ length: room.rows }, (_, y) =>
    Array.from({ length: room.cols }, (_, x) => y >= room.walls.top && y < room.rows - room.walls.bottom && !blocked.has(`${x},${y}`)));
}
