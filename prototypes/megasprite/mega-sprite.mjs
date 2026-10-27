// Renders a MEGA from the template data: no image generation involved.
// renderMega(spec, options) -> { w, h, px }; toSvg (re-exported) turns that into crisp-edged SVG.
import { ANTENNAS, BADGE, BADGE_PARTS, DECALS, DECAL_ANCHOR, EXPRESSIONS, EYE_COLORS, EYE_STYLES, FIXED_COLORS, FRAMES, GRID, STICKER, STICKER_STANDINS, STORE_COLORS, VIEWS } from "./mega-template.mjs";
import { blank, crop, mirror, onTile, paint, shades, withShades } from "./pixel-paint.mjs";

export { toSvg } from "./pixel-paint.mjs";

/** Shell shades derived from one colour: the family picks a hex, the rest follows. */
export function palette(spec) {
  const { light, dark } = shades(spec.shell);
  return { ...FIXED_COLORS, ...STORE_COLORS, eye: EYE_COLORS[spec.eyeColor] ?? FIXED_COLORS.eye, shell: spec.shell, shellLight: light, shellDark: dark, decal: spec.decalColor ?? "#FFD54A" };
}

const overlay = (id, fill, shapes) => shapes.map((shape) => ({ id, group: "body", fill, shape, shade: false, outline: false }));

// Swap in the spec's antenna (default classic) where the template's antenna parts sit.
function withAntenna(parts, name) {
  if (!name || name === "classic") return parts;
  const i = parts.findIndex((p) => p.id.startsWith("antenna"));
  return [...parts.slice(0, i), ...(ANTENNAS[name] ?? ANTENNAS.classic), ...parts.slice(i).filter((p) => !p.id.startsWith("antenna"))];
}

function layersFor(spec, view, expression) {
  const eyes = expression === "open" && spec.eyes ? EYE_STYLES[spec.eyes] : null;
  const face = eyes ? { ...EXPRESSIONS.open, ...eyes } : EXPRESSIONS[expression] ?? EXPRESSIONS.blank;
  if (view === "front")
    return [
      ...withAntenna(VIEWS.front, spec.antenna),
      ...(spec.decal === "none" ? [] : overlay("decal", "decal", [{ pattern: [...DECAL_ANCHOR, DECALS[spec.decal] ?? DECALS.star] }])),
      ...overlay("eyes", "eye", face.front),
      ...(face.paint ?? []).flatMap(({ fill, shape }) => overlay("eyes", fill, [shape])),
      ...overlay("blush", "blush", face.blush ?? []),
    ];
  if (view === "side") return [...withAntenna(VIEWS.side, spec.antenna), ...overlay("eyes", "eye", face.side)];
  return withAntenna(VIEWS[view], spec.antenna);
}

/**
 * @param spec    { shell: "#2FB8B0", decal: "star" | "none", decalColor?, antenna?: keyof ANTENNAS, eyes?: keyof EYE_STYLES, eyeColor?: keyof EYE_COLORS }
 * @param options { view: front|back|right|left, frame: stand|stepL|stepR, expression, badge, keys }
 */
export function renderMega(spec, { view = "front", frame = "stand", expression = "open", badge = false, keys = false } = {}) {
  const base = view === "right" || view === "left" ? "side" : view;
  let layers = layersFor(spec, base, expression);
  if (badge) layers = layers.filter((p) => BADGE_PARTS.includes(p.id));

  // keys: pixels hold palette names instead of hex, so a client can recolour live.
  const pal = palette(spec);
  const colors = keys ? Object.fromEntries(Object.keys(pal).map((k) => [k, k])) : pal;
  let sprite = paint(blank(GRID.w, GRID.h), layers, colors, { offsets: FRAMES[base][frame] ?? {} });
  if (view === "left") sprite = mirror(sprite);
  return badge ? onTile(crop(sprite), BADGE) : sprite;
}

/** A mockup stand-in sticker on a transparent sprite-sized picture, at the template anchor. */
export function renderStickerStandin(name) {
  const { rows, color } = STICKER_STANDINS[name];
  const [ax, ay] = STICKER.anchor;
  const core = rows.flatMap((row, j) => [...row].flatMap((c, i) => (c === "#" ? [[ax + 2 + i, ay + 2 + j]] : [])));
  const seen = new Set(core.map(([x, y]) => `${x},${y}`));
  const backing = [...core];
  for (const [x, y] of core)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]])
      if (!seen.has(`${x + dx},${y + dy}`)) { seen.add(`${x + dx},${y + dy}`); backing.push([x + dx, y + dy]); }
  const pal = { ...withShades({ ink: color }), outline: FIXED_COLORS.outline, white: FIXED_COLORS.white };
  return paint(blank(GRID.w, GRID.h), [
    { id: "backing", group: "body", fill: "white", shape: { px: backing }, shade: false, outline: true },
    { id: "ink", group: "body", fill: "ink", shape: { px: core }, shade: true, outline: false },
  ], pal);
}
