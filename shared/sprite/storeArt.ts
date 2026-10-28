// GD (Store, Screens 10–11): the pixel Mega Bucks coin and the Store's furniture, drawn by the same pixel
// engine as the MEGA. Ported from the design build (design/build/store-live.js `COIN_ROWS`) and
// prototypes/megasprite/hq-template.mjs (FURNITURE / ROOM_COLORS / DECOR / ROOM_COLORS_ON_OFFER) — only the
// pieces the Store sells; the full room engine (walls, floor, stations) is G5's. Pure data + math, no React.
import type { FurnitureKindId } from '../config/store';
import { blank, flat, paint, part, type Part, type Picture, withShades } from './pixelPaint';

/** The Mega Bucks coin: 12x12 art pixels with an "M", outlined in the MEGA navy. Each letter is a color key. */
export const COIN = {
  rows: ['...oooooo...', '.ooLLLLLLoo.', '.oLyyyyyyDo.', 'oLyMyyyyMyDo', 'oLyMMyyMMyDo', 'oLyMyMMyMyDo', 'oLyMyyyyMyDo', 'oLyMyyyyMyDo', 'oLyyyyyyyyDo', '.oyyyyyyyDo.', '.ooDDDDDDoo.', '...oooooo...'],
  colors: { o: '#1B1A3A', L: '#FFF1A8', y: '#FFD54A', D: '#E0A21B', M: '#8A5A00' } as Record<string, string>,
};

/** The coin as a picture (transparent where the rows have "."). */
export function renderCoin(): Picture {
  const h = COIN.rows.length;
  const w = COIN.rows[0].length;
  const pic = blank(w, h);
  COIN.rows.forEach((row, y) => [...row].forEach((k, x) => (pic.px[y * w + x] = k === '.' ? null : COIN.colors[k])));
  return pic;
}

const TILE = 32;

const ROOM_COLORS: Record<string, string> = {
  outline: '#1B1A3A',
  wood: '#B77B4B',
  woodDark: '#8A5A3A',
  paper: '#FFFFFF',
  red: '#E25B5B',
  green: '#6CBF6A',
  pot: '#C9734A',
  yellow: '#F2C94C',
  silver: '#C9CFDB',
  screen: '#7FE3F0',
  bezel: '#2A2F4A',
  accent: '#8E6CE0',
};

/** The accent colors a colorable piece can take (index = the room's `furnitureItem.color` choice). */
export const FURNITURE_ACCENTS = ['#8E6CE0', '#5B8DEF', '#6CBF6A', '#F2766B'] as const;

/** Each Store piece: footprint in tiles, whether its accent can be recolored, and its parts (art pixels,
 * relative to its top-left tile; negative y overhangs into the one tile of headroom above). */
export const FURNITURE_ART: Record<FurnitureKindId, { size: [number, number]; colorable: boolean; defaultAccent: number; parts: Part[] }> = {
  bed: {
    size: [1, 2],
    colorable: true,
    defaultAccent: 0,
    parts: [
      part('frame', 'body', 'wood', { round: [2, 0, 28, 62, 1] }),
      part('pillow', 'body', 'paper', { round: [5, 4, 22, 10, 2] }, { shade: false }),
      part('blanket', 'body', 'accent', { rect: [3, 20, 26, 40] }),
      flat('fold', 'body', 'accentLight', { rect: [3, 20, 26, 4] }),
    ],
  },
  desk: {
    size: [2, 1],
    colorable: false,
    defaultAccent: 0,
    parts: [
      part('legL', 'body', 'woodDark', { rect: [4, 22, 4, 8] }, { shade: false }),
      part('legR', 'body', 'woodDark', { rect: [56, 22, 4, 8] }, { shade: false }),
      part('top', 'body', 'wood', { rect: [2, 6, 60, 16] }),
      part('monitor', 'body', 'bezel', { round: [6, -14, 22, 18, 1] }, { shade: false }),
      flat('screen', 'body', 'screen', { rect: [8, -12, 18, 13] }),
      flat('screenLines', 'body', 'bezel', { pattern: [10, -9, ['######......', '............', '##########..', '............', '#######.....']] }),
      part('stand', 'body', 'bezel', { rect: [15, 4, 4, 4] }, { shade: false }),
      part('papers', 'body', 'paper', { rect: [38, 9, 12, 8] }, { shade: false }),
      part('cup', 'body', 'red', { rect: [53, 6, 5, 7] }),
      flat('pencil', 'body', 'yellow', { rect: [55, 2, 1, 4] }),
    ],
  },
  lamp: {
    size: [1, 1],
    colorable: true,
    defaultAccent: 3,
    parts: [
      part('base', 'body', 'woodDark', { round: [10, 24, 12, 6, 1] }, { shade: false }),
      part('pole', 'body', 'silver', { rect: [15, 8, 2, 16] }, { shade: false }),
      part('shade', 'body', 'accent', { round: [7, -2, 18, 12, 2] }),
    ],
  },
  rugSmall: {
    size: [2, 2],
    colorable: true,
    defaultAccent: 1,
    parts: [part('rug', 'body', 'accent', { round: [4, 4, 56, 56, 5] }, { shade: false }), flat('inner', 'body', 'accentLight', { round: [10, 10, 44, 44, 4] })],
  },
  plant: {
    size: [1, 1],
    colorable: false,
    defaultAccent: 0,
    parts: [
      part('pot', 'body', 'pot', { round: [9, 18, 14, 12, 2] }),
      part('leaves', 'body', 'green', { round: [5, 0, 22, 20, 5] }),
      flat('vein', 'body', 'greenDark', {
        px: [
          [16, 6],
          [16, 7],
          [16, 8],
          [16, 9],
          [16, 10],
          [16, 11],
          [13, 9],
          [19, 8],
        ],
      }),
    ],
  },
  toybox: {
    size: [1, 1],
    colorable: true,
    defaultAccent: 3,
    parts: [
      part('box', 'body', 'accent', { rect: [3, 12, 26, 18] }),
      part('lid', 'body', 'accentDark', { rect: [2, 6, 28, 6] }, { shade: false }),
      flat('star', 'body', 'paper', { pattern: [14, 17, ['.#.', '###', '#.#']] }),
    ],
  },
  beanbag: {
    size: [1, 1],
    colorable: true,
    defaultAccent: 2,
    parts: [part('bag', 'body', 'accent', { round: [3, 8, 26, 22, 6] }), flat('dent', 'body', 'accentDark', { round: [10, 14, 12, 7, 2] })],
  },
};

/** One Store piece on its own transparent picture, with one tile of headroom above for overhang. */
export function renderFurniture(kind: FurnitureKindId, accent?: string): Picture {
  const art = FURNITURE_ART[kind];
  const pal = withShades({ ...ROOM_COLORS, accent: accent ?? FURNITURE_ACCENTS[art.defaultAccent] });
  return paint(blank(art.size[0] * TILE, (art.size[1] + 1) * TILE), art.parts, pal, { origin: [0, TILE] });
}
