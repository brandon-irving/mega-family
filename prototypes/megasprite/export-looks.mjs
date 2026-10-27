// Writes what the profile mockup needs to draw a MEGA live in any colour:
// the front body as palette-key runs (no face, no decal), each face as key runs,
// the fixed colours, and one stand-in sticker overlay per sticker. Store parts (antenna shapes, eye
// designs and their colours) go to a separate store.json so looks.json stays as it was.
// usage: node export-looks.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ANTENNAS, EYE_STYLES, FIXED_COLORS, PERSONALITIES, SHELL_COLORS, STICKER_STANDINS, STORE_COLORS } from "./mega-template.mjs";
import { renderMega, renderStickerStandin, toSvg } from "./mega-sprite.mjs";

const outDir = process.argv[2] ?? "out/looks";
mkdirSync(outDir, { recursive: true });

/** Row runs of equal key: [x, y, width, key]. Pixels equal to `base` are skipped (for overlays). */
function runs({ w, h, px }, base) {
  const out = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; ) {
      const i = y * w + x, k = base && px[i] === base.px[i] ? null : px[i];
      let n = 1;
      while (x + n < w && (base && px[i + n] === base.px[i + n] ? null : px[i + n]) === k) n++;
      if (k) out.push([x, y, n, k]);
      x += n;
    }
  return out;
}

const keyed = (expression) => renderMega({ shell: "#000000", decal: "none" }, { expression, keys: true });
const body = keyed("blank");
const faces = {};
for (const face of new Set([...Object.values(PERSONALITIES).map((p) => p.face), "closed"])) faces[face] = runs(keyed(face), body);

for (const name of Object.keys(STICKER_STANDINS)) writeFileSync(join(outDir, `sticker_${name}.svg`), toSvg(renderStickerStandin(name), 1));

const looks = { grid: [body.w, body.h], body: runs(body), faces, fixed: FIXED_COLORS, colors: SHELL_COLORS, stickers: Object.keys(STICKER_STANDINS), personalities: PERSONALITIES };
writeFileSync(join(outDir, "looks.json"), JSON.stringify(looks));
console.log("body runs", looks.body.length, "faces", Object.keys(faces).join(","), "stickers", looks.stickers.length);

// Store parts: each antenna as runs above the head (row < ANTENNA_ROWS, which a client drops from
// `body` before adding the chosen one), and each eye design as an overlay on the blank face.
const ANTENNA_ROWS = 8;
const antennas = {};
for (const name of Object.keys(ANTENNAS)) antennas[name] = runs(renderMega({ shell: "#000000", decal: "none", antenna: name }, { expression: "blank", keys: true })).filter((r) => r[1] < ANTENNA_ROWS);
const eyes = {};
for (const name of Object.keys(EYE_STYLES)) eyes[name] = runs(renderMega({ shell: "#000000", decal: "none", eyes: name }, { expression: "open", keys: true }), body);
writeFileSync(join(outDir, "store.json"), JSON.stringify({ antennaRows: ANTENNA_ROWS, antennas, eyes, colors: STORE_COLORS }));
console.log("antennas", Object.keys(antennas).join(","), "eyes", Object.keys(eyes).join(","));
