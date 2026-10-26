// Writes a personal room's pieces for the mockup: one base per wall colour, every
// decor item in every offered colour, the poster art large, and room.json.
// usage: node export-room.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DECOR, FURNITURE, MY_ROOM, POSTER_PLACEHOLDER, ROOM_COLORS, ROOM_COLORS_ON_OFFER, TILE, WALL_COLORS } from "./hq-template.mjs";
import { renderItem, renderRoomBase } from "./hq-room.mjs";
import { blank, paint, toSvg, withShades } from "./pixel-paint.mjs";

const outDir = process.argv[2] ?? "out/room";
mkdirSync(outDir, { recursive: true });

const OWNER = { id: "violet", spec: { shell: "#8E6CE0", decal: "bolt", decalColor: "#FFE36E" } };

const pictures = {}; // name -> picture, written as JSON for the PNG step
WALL_COLORS.forEach((c, i) => { pictures[`room_base_${i}`] = renderRoomBase(MY_ROOM, OWNER, c); });

for (const [kind, meta] of Object.entries(DECOR)) {
  const colors = meta.colorable ? ROOM_COLORS_ON_OFFER : [null];
  colors.forEach((hex, i) => writeFileSync(join(outDir, `item_${kind}_${i}.svg`), toSvg(renderItem(kind, hex), 1)));
}

const [pw, ph] = POSTER_PLACEHOLDER.size;
writeFileSync(join(outDir, "poster_large.svg"), toSvg(paint(blank(pw, ph), POSTER_PLACEHOLDER.parts, withShades(ROOM_COLORS)), 1));

const layout = {
  tile: TILE, cols: MY_ROOM.cols, rows: MY_ROOM.rows, walls: MY_ROOM.walls, exitTile: MY_ROOM.exitTile,
  blockedFixed: [MY_ROOM.exitTile],
  colors: ROOM_COLORS_ON_OFFER, walls_on_offer: WALL_COLORS.map((c) => ({ name: c.name, hex: c.wall })),
  decor: Object.fromEntries(Object.entries(DECOR).map(([kind, meta]) => [kind, { ...meta, size: FURNITURE[kind].size }])),
  items: MY_ROOM.items,
};
writeFileSync(join(outDir, "room.json"), JSON.stringify(layout, null, 1));
writeFileSync(join(outDir, "pictures.json"), JSON.stringify(pictures));
console.log("wrote items, room.json and", Object.keys(pictures).length, "room bases to", outDir);
