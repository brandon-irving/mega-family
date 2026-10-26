// Writes SVGs and a frames.json dump for the Python preview (sheet + walk GIF).
import { mkdirSync, writeFileSync } from "node:fs";
import { renderMega, toSvg } from "./mega-sprite.mjs";

const out = new URL("./out/", import.meta.url);
mkdirSync(out, { recursive: true });

const FAMILY = {
  teal: { shell: "#2FB8B0", decal: "star" },
  coral: { shell: "#F2766B", decal: "heart" },
  violet: { shell: "#8E6CE0", decal: "bolt", decalColor: "#FFE36E" },
  sun: { shell: "#F2B33D", decal: "leaf", decalColor: "#5BBF6A" },
};

const VIEWS = { front: ["stand", "stepL", "stepR"], back: ["stand", "stepL", "stepR"], right: ["stand", "stepL", "stepR"], left: ["stand", "stepL", "stepR"] };
const frames = {};
for (const [name, spec] of Object.entries(FAMILY)) {
  frames[name] = {};
  for (const [view, list] of Object.entries(VIEWS))
    for (const frame of list) frames[name][`${view}_${frame}`] = renderMega(spec, { view, frame, expression: "open" });
  for (const expression of ["blank", "open", "closed", "happy"]) {
    frames[name][`badge_${expression}`] = renderMega(spec, { badge: true, expression });
    frames[name][`front_${expression}`] = renderMega(spec, { expression });
  }
  writeFileSync(new URL(`${name}_front.svg`, out), toSvg(renderMega(spec, { expression: "happy" })));
  writeFileSync(new URL(`${name}_badge.svg`, out), toSvg(renderMega(spec, { badge: true, expression: "open" })));
}
writeFileSync(new URL("frames.json", out), JSON.stringify(frames));
console.log("wrote", Object.keys(FAMILY).length * 2, "svgs + frames.json");
