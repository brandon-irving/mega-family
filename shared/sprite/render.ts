// Pure-TS port of prototypes/megasprite/mega-sprite.mjs — renders a MEGA from the template data.
// No image generation involved: renderMega(spec, options) -> { w, h, px }.
import type { StickerId } from '../config/looks';
import type { AntennaId, EyeColorId, EyeStyleId } from '../config/store';
import { blank, crop, mirror, onTile, paint, type Part, type Picture, shades, withShades } from './pixelPaint';
import {
  ANTENNAS,
  BADGE,
  BADGE_PARTS,
  EXPRESSIONS,
  type ExpressionName,
  EYE_COLORS,
  EYE_STYLES,
  FIXED_COLORS,
  FRAMES,
  type FrameName,
  STICKER,
  STICKER_STANDINS,
  STORE_PART_COLORS,
  type ViewName,
  VIEWS,
  WAVE_PARTS,
} from './template';

/** GD (CONTRACT v0.13 `megaLook`): `antenna`, `eyes` and `eyeColor` are optional Store parts; missing means
 * `classic`, so every existing MEGA renders exactly as before. */
export type SpriteSpec = { shell: string; sticker: StickerId; antenna?: AntennaId; eyes?: EyeStyleId; eyeColor?: EyeColorId };
export type View = ViewName | 'left' | 'right';

/** Shell shades derived from one color: pick a hex, the rest follows. */
export function palette(spec: SpriteSpec): Record<string, string> {
  const { light, dark } = shades(spec.shell);
  return {
    ...withShades({ ...FIXED_COLORS, ...STORE_PART_COLORS }),
    // A bought eye color recolors the "eye" key, so every face (open, happy, wink, closed) follows.
    eye: EYE_COLORS[spec.eyeColor ?? 'classic'] ?? FIXED_COLORS.eye,
    shell: spec.shell,
    shellLight: light,
    shellDark: dark,
  };
}

/** Swaps in the spec's antenna (default classic) where the template's antenna parts sit. */
function withAntenna(parts: Part[], name: AntennaId | undefined): Part[] {
  if (!name || name === 'classic') return parts;
  const i = parts.findIndex((p) => p.id.startsWith('antenna'));
  if (i < 0) return parts;
  return [...parts.slice(0, i), ...ANTENNAS[name], ...parts.slice(i).filter((p) => !p.id.startsWith('antenna'))];
}

const overlay = (id: string, fill: string, shapes: Part['shape'][]): Part[] => shapes.map((shape) => ({ id, group: 'body', fill, shape, shade: false, outline: false }));

/** The sticker, drawn as a simple code-drawn placeholder (a colored glyph on a white backing tile). */
function stickerLayers(sticker: StickerId): Part[] {
  if (sticker === 'none') return [];
  const standin = STICKER_STANDINS[sticker];
  if (!standin) return [];
  const [ax, ay] = STICKER.anchor;
  const core: [number, number][] = standin.rows.flatMap((row, j) => [...row].flatMap((c, i): [number, number][] => (c === '#' ? [[ax + 2 + i, ay + 2 + j]] : [])));
  const seen = new Set(core.map(([x, y]) => `${x},${y}`));
  const backing = [...core];
  for (const [x, y] of core)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ])
      if (!seen.has(`${x + dx},${y + dy}`)) {
        seen.add(`${x + dx},${y + dy}`);
        backing.push([x + dx, y + dy]);
      }
  return [
    { id: 'stickerBacking', group: 'body', fill: 'white', shape: { px: backing }, shade: false, outline: true },
    { id: 'sticker', group: 'body', fill: 'stickerInk', shape: { px: core }, shade: true, outline: false },
  ];
}

function layersFor(spec: SpriteSpec, view: ViewName, expression: ExpressionName): Part[] {
  // A bought eye design replaces only the resting "open" eyes; other expressions keep their own.
  const design = expression === 'open' && spec.eyes && spec.eyes !== 'classic' ? EYE_STYLES[spec.eyes] : null;
  const face = design ? { ...EXPRESSIONS.open, ...design } : (EXPRESSIONS[expression] ?? EXPRESSIONS.blank);
  if (view === 'front')
    return [
      ...withAntenna(VIEWS.front, spec.antenna),
      ...stickerLayers(spec.sticker),
      ...overlay('eyes', 'eye', face.front),
      ...(design?.paint ?? []).flatMap(({ fill, shape }) => overlay('eyes', fill, [shape])),
      ...overlay('blush', 'blush', face.blush ?? []),
    ];
  if (view === 'side') return [...withAntenna(VIEWS.side, spec.antenna), ...overlay('eyes', 'eye', face.side)];
  return withAntenna(VIEWS[view], spec.antenna);
}

/** The badge keeps the head parts plus whichever antenna is on (twin/star/sprout use their own part ids). */
const inBadge = (p: Part) => BADGE_PARTS.includes(p.id) || p.id.startsWith('antenna');

export type RenderOptions = { view?: View; frame?: FrameName; expression?: ExpressionName; badge?: boolean };

/**
 * @param spec { shell: "#2FB8B0", sticker: "star" | "none", antenna?, eyes?, eyeColor? }
 * @param options { view: front|back|right|left, frame: stand|stepL|stepR, expression, badge }
 */
export function renderMega(spec: SpriteSpec, options: RenderOptions = {}): Picture {
  const { view = 'front', frame = 'stand', expression = 'open', badge = false } = options;
  const base: ViewName = view === 'right' || view === 'left' ? 'side' : view;
  let layers = layersFor(spec, base, expression);
  if (!badge && base === 'front' && (frame === 'waveIn' || frame === 'waveOut')) {
    layers = [...layers.filter(p => p.id !== 'armR' && p.id !== 'mittenR'), ...WAVE_PARTS[frame]];
  }
  if (badge) layers = layers.filter(inBadge);

  const pal = palette(spec);
  // The sticker's ink color comes from its own standin, not the shell.
  if (spec.sticker !== 'none' && STICKER_STANDINS[spec.sticker]) {
    const { light, dark } = shades(STICKER_STANDINS[spec.sticker].color);
    pal.stickerInk = STICKER_STANDINS[spec.sticker].color;
    pal.stickerInkLight = light;
    pal.stickerInkDark = dark;
  }
  let sprite = paint(blank(32, 40), layers, pal, { offsets: FRAMES[base][frame] ?? {} });
  if (view === 'left') sprite = mirror(sprite);
  return badge ? onTile(crop(sprite), BADGE) : sprite;
}
