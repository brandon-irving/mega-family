// Writes the HQ room, every walk frame for each MEGA, and hq.json (layout for the mockup).
// usage: node export-hq.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HQ, TILE } from "./hq-template.mjs";
import { renderRoom, walkable } from "./hq-room.mjs";
import { renderMega, toSvg } from "./mega-sprite.mjs";

const outDir = process.argv[2] ?? "out/hq";
mkdirSync(outDir, { recursive: true });

const MEMBERS = [
  { id: "teal", spec: { shell: "#2FB8B0", decal: "star" } },
  { id: "coral", spec: { shell: "#F2766B", decal: "heart" } },
  { id: "violet", spec: { shell: "#8E6CE0", decal: "bolt", decalColor: "#FFE36E" } },
];

const room = renderRoom(HQ, MEMBERS);
writeFileSync(join(outDir, "hq_room.svg"), toSvg(room, 1));

const files = ["hq_room.svg"];
for (const { id, spec } of MEMBERS) {
  for (const view of ["front", "back", "left", "right"])
    for (const frame of ["stand", "stepL", "stepR"]) {
      const name = `${id}_${view}_${frame}.svg`;
      writeFileSync(join(outDir, name), toSvg(renderMega(spec, { view, frame, expression: "open" }), 1));
      files.push(name);
    }
  const happy = `${id}_front_happy.svg`;
  writeFileSync(join(outDir, happy), toSvg(renderMega(spec, { expression: "happy" }), 1));
  files.push(happy);
}

const layout = {
  tile: TILE, cols: HQ.cols, rows: HQ.rows,
  walkable: walkable(HQ).map((row) => row.map((ok) => (ok ? 1 : 0)).join("")),
  stations: HQ.stations,
  doors: MEMBERS.map((m, i) => ({ id: m.id, tile: HQ.doorTiles[i] })),
};
writeFileSync(join(outDir, "hq.json"), JSON.stringify(layout, null, 1));
console.log("wrote", files.length, "svgs + hq.json to", outDir);
