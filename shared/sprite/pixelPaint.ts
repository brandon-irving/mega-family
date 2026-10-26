// Pure-TS port of prototypes/megasprite/pixel-paint.mjs — the pixel engine shared by MEGAs and rooms.
// A picture is { w, h, px } where px is a row-major array of hex colors (null = transparent).
// Parts are { id, group, fill, shape, shade, outline } with shapes
// { rect: [x,y,w,h] }, { round: [x,y,w,h,r] } (corners cut by r), { px: [[x,y],...] } or
// { pattern: [x,y,rows] } ("#" = filled). No React here — this is data + math only.

export type Shape =
  | { rect: [number, number, number, number]; round?: undefined; px?: undefined; pattern?: undefined }
  | { round: [number, number, number, number, number]; rect?: undefined; px?: undefined; pattern?: undefined }
  | { px: [number, number][]; rect?: undefined; round?: undefined; pattern?: undefined }
  | { pattern: [number, number, string[]]; rect?: undefined; round?: undefined; px?: undefined };

export type Part = { id: string; group: string; fill: string; shape: Shape; shade: boolean; outline: boolean };
export type Picture = { w: number; h: number; px: (string | null)[] };
export type Palette = Record<string, string>;

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Light and dark shades of one color, with a slight hue shift like hand-pixelled art. */
export function shades(hex: string): { light: string; dark: string } {
  const [h, s, l] = hexToHsl(hex);
  return {
    light: hslToHex((h + 356) % 360, s, clamp(l + 0.13, 0, 0.92)),
    dark: hslToHex((h + 8) % 360, s, clamp(l - 0.16, 0.08, 1)),
  };
}

/** Expand { name: hex } into { name, nameLight, nameDark } for every entry. */
export function withShades(colors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, hex] of Object.entries(colors)) {
    const { light, dark } = shades(hex);
    out[name] = hex;
    out[name + 'Light'] ??= light;
    out[name + 'Dark'] ??= dark;
  }
  return out;
}

export const part = (id: string, group: string, fill: string, shape: Shape, opts: { shade?: boolean; outline?: boolean } = {}): Part => ({
  id,
  group,
  fill,
  shape,
  shade: opts.shade ?? true,
  outline: opts.outline ?? true,
});
export const flat = (id: string, group: string, fill: string, shape: Shape): Part => part(id, group, fill, shape, { shade: false, outline: false });

export function shapeCells(shape: Shape): [number, number][] {
  if (shape.px) return shape.px;
  if (shape.pattern) {
    const [x, y, rows] = shape.pattern;
    return rows.flatMap((row, j) => [...row].flatMap((c, i): [number, number][] => (c === '#' ? [[x + i, y + j]] : [])));
  }
  const [x, y, w, h, r = 0] = (shape.rect ?? shape.round)!;
  const cells: [number, number][] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (Math.min(i, w - 1 - i) + Math.min(j, h - 1 - j) >= r) cells.push([x + i, y + j]);
  return cells;
}

export const blank = (w: number, h: number, fill: string | null = null): Picture => ({ w, h, px: new Array(w * h).fill(fill) });

/**
 * Draw parts onto a picture in place. Outlined parts get a 1px border drawn over whatever is
 * beneath; shaded parts use the Light tone on their top row and the Dark tone on their bottom row.
 */
export function paint(pic: Picture, parts: Part[], pal: Palette, opts: { offsets?: Record<string, [number, number]>; origin?: [number, number] } = {}): Picture {
  const { offsets = {}, origin = [0, 0] } = opts;
  const { w, h, px } = pic;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  for (const p of parts) {
    const [dx, dy] = offsets[p.group] ?? [0, 0];
    const cells = shapeCells(p.shape)
      .map(([x, y]): [number, number] => [x + dx + origin[0], y + dy + origin[1]])
      .filter(([x, y]) => inside(x, y));
    const mask = new Set(cells.map(([x, y]) => y * w + x));
    if (p.outline)
      for (const [x, y] of cells)
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ])
          if (inside(nx, ny) && !mask.has(ny * w + nx)) px[ny * w + nx] = pal.outline;
    for (const [x, y] of cells) {
      let key = p.fill;
      if (p.shade) {
        if (!mask.has((y - 1) * w + x)) key += 'Light';
        else if (!mask.has((y + 1) * w + x)) key += 'Dark';
      }
      px[y * w + x] = pal[key] ?? pal[p.fill] ?? p.fill;
    }
  }
  return pic;
}

export function mirror({ w, h, px }: Picture): Picture {
  const out: (string | null)[] = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = px[y * w + (w - 1 - x)];
  return { w, h, px: out };
}

export function crop({ w, h, px }: Picture): Picture {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  px.forEach((c, i) => {
    if (!c) return;
    const x = i % w;
    const y = Math.floor(i / w);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  });
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out: (string | null)[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(px[y * w + x]);
  return { w: cw, h: ch, px: out };
}

/** Pad a picture and fill every transparent pixel with the tile color. */
export function onTile({ w, h, px }: Picture, opts: { pad: number; background: string }): Picture {
  const { pad, background } = opts;
  const tw = w + pad * 2;
  const th = h + pad * 2;
  const out: (string | null)[] = new Array(tw * th).fill(background);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(y + pad) * tw + x + pad] = px[y * w + x] ?? background;
  return { w: tw, h: th, px: out };
}

/** One rect per horizontal run of equal color — used to build SVG <Rect>s or to count runs in tests. */
export function runs({ w, h, px }: Picture): { x: number; y: number; w: number; color: string }[] {
  const out: { x: number; y: number; w: number; color: string }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; ) {
      const c = px[y * w + x];
      let run = 1;
      while (x + run < w && px[y * w + x + run] === c) run++;
      if (c) out.push({ x, y, w: run, color: c });
      x += run;
    }
  }
  return out;
}
