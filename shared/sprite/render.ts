// Pure-TS port of prototypes/megasprite/mega-sprite.mjs — renders a MEGA from the template data.
// No image generation involved: renderMega(spec, options) -> { w, h, px }.
import type { StickerId } from '../config/looks';
import { blank, crop, mirror, onTile, paint, type Part, type Picture, shades, withShades } from './pixelPaint';
import { BADGE, BADGE_PARTS, EXPRESSIONS, type ExpressionName, FIXED_COLORS, FRAMES, type FrameName, STICKER, STICKER_STANDINS, type ViewName, VIEWS } from './template';

export type SpriteSpec = { shell: string; sticker: StickerId };
export type View = ViewName | 'left' | 'right';

/** Shell shades derived from one color: pick a hex, the rest follows. */
export function palette(spec: SpriteSpec): Record<string, string> {
  const { light, dark } = shades(spec.shell);
  return { ...withShades(FIXED_COLORS), shell: spec.shell, shellLight: light, shellDark: dark };
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
  const face = EXPRESSIONS[expression] ?? EXPRESSIONS.blank;
  if (view === 'front')
    return [...VIEWS.front, ...stickerLayers(spec.sticker), ...overlay('eyes', 'eye', face.front), ...overlay('blush', 'blush', face.blush ?? [])];
  if (view === 'side') return [...VIEWS.side, ...overlay('eyes', 'eye', face.side)];
  return VIEWS[view];
}

export type RenderOptions = { view?: View; frame?: FrameName; expression?: ExpressionName; badge?: boolean };

/**
 * @param spec { shell: "#2FB8B0", sticker: "star" | "none" }
 * @param options { view: front|back|right|left, frame: stand|stepL|stepR, expression, badge }
 */
export function renderMega(spec: SpriteSpec, options: RenderOptions = {}): Picture {
  const { view = 'front', frame = 'stand', expression = 'open', badge = false } = options;
  const base: ViewName = view === 'right' || view === 'left' ? 'side' : view;
  let layers = layersFor(spec, base, expression);
  if (badge) layers = layers.filter((p) => BADGE_PARTS.includes(p.id));

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
