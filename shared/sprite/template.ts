// Pure-TS port of prototypes/megasprite/mega-template.mjs — the MEGA body as data on a 32x40 grid.
// Parts draw in order; each outlined part gets a 1px navy border over whatever is beneath it.
import type { AntennaId, EyeColorId, EyeStyleId } from '../config/store';
import { flat, part, type Part, type Shape } from './pixelPaint';

export const GRID = { w: 32, h: 40 };

export const FIXED_COLORS: Record<string, string> = {
  outline: '#1B1A3A',
  visor: '#17143A',
  glare: '#BFEAF7',
  white: '#F4F6FB',
  whiteLight: '#FFFFFF',
  whiteDark: '#AEB3CC',
  silver: '#C9CFDB',
  silverLight: '#E8EBF2',
  silverDark: '#8E95AB',
  tip: '#9FF0F7',
  tipLight: '#F0FFFF',
  tipDark: '#5FCFE0',
  eye: '#E8FFFF',
  blush: '#FF9AB2',
};

/** GD (Store, owner Oct 27): antenna shapes, ported from prototypes/megasprite/mega-template.mjs ANTENNAS.
 * Every part id starts with "antenna" and stays above row 8 (the head's top edge), so the renderer swaps
 * the antenna without touching the rest of the body. `classic` is the one every MEGA starts with. The id
 * list is config (shared/config/ids.ts ANTENNA_IDS); prices live in shared/config/store.ts. */
export const ANTENNAS: Record<AntennaId, Part[]> = {
  classic: [part('antennaStem', 'body', 'silver', { rect: [15, 4, 2, 4] }), part('antennaTip', 'body', 'tip', { round: [14, 1, 4, 3, 1] })],
  twin: [
    part('antennaStemL', 'body', 'silver', { rect: [10, 4, 2, 4] }),
    part('antennaStemR', 'body', 'silver', { rect: [20, 4, 2, 4] }),
    part('antennaTipL', 'body', 'tip', { round: [9, 1, 4, 3, 1] }),
    part('antennaTipR', 'body', 'tip', { round: [19, 1, 4, 3, 1] }),
  ],
  star: [part('antennaStem', 'body', 'silver', { rect: [15, 6, 2, 2] }), part('antennaStar', 'body', 'star', { pattern: [13, 1, ['..#..', '.###.', '#####', '.###.', '.#.#.']] })],
  sprout: [
    part('antennaStem', 'body', 'sprout', { rect: [15, 4, 2, 4] }),
    part('antennaLeafL', 'body', 'sprout', { pattern: [11, 2, ['##..', '###.', '.###']] }),
    part('antennaLeafR', 'body', 'sprout', { pattern: [17, 1, ['..##', '.###', '###.']] }),
  ],
};
const antenna: Part[] = ANTENNAS.classic;

/** Colors only Store parts use (their light/dark shades are derived at render time), kept apart from
 * FIXED_COLORS. The anime* colors come from the Muse Image eyes (ANIME_EYE below). */
export const STORE_PART_COLORS: Record<string, string> = {
  star: '#FFD54A',
  sprout: '#5BBF6A',
  animeBlue: '#0157B7',
  animeTeal: '#02A0BC',
  animeCyan: '#00CCC6',
  animeAqua: '#00F2CF',
  animePupil: '#15123D',
  animeShine: '#FFFFFF',
};

/** Eye colors recolor the standard eyes in every expression (the renderer swaps the "eye" palette entry). */
export const EYE_COLORS: Record<EyeColorId, string> = { classic: '#E8FFFF', pink: '#FF9AD5', gold: '#FFD54A', mint: '#7DF2B0', lilac: '#C7A6FF', ember: '#FF8A5B' };

/** Anime eyes: made once with Muse Image (Oct 27; source design/mega-screens/assets/looks/source/
 * anime-eyes-muse.png) and downscaled to the visor grid — one 7x6 eye drawn twice. Each letter is a palette
 * key; "." is the visor showing through. */
export const ANIME_EYE = {
  at: [
    [8, 14],
    [17, 14],
  ] as [number, number][],
  rows: ['..bbb..', '.bbpwbb', 'ttppwtt', 'ccpppcc', '.aacaa.', '..aaa..'],
  keys: { b: 'animeBlue', t: 'animeTeal', c: 'animeCyan', a: 'animeAqua', p: 'animePupil', w: 'animeShine' } as Record<string, string>,
};

/** One-color patterns per palette key, at both eye positions. */
function animeFront(): { fill: string; shape: Shape }[] {
  return ANIME_EYE.at.flatMap(([x, y]) =>
    Object.entries(ANIME_EYE.keys).map(([ch, fill]) => ({ fill, shape: { pattern: [x, y, ANIME_EYE.rows.map((r) => [...r].map((c) => (c === ch ? '#' : '.')).join(''))] } as Shape })),
  );
}

/** Eye designs replace only the resting "open" eyes; other expressions keep their own. `paint` pieces carry
 * their own palette key. */
export const EYE_STYLES: Record<EyeStyleId, { front: Shape[]; side: Shape[]; paint?: { fill: string; shape: Shape }[] }> = {
  classic: { front: [{ rect: [11, 15, 2, 3] }, { rect: [19, 15, 2, 3] }], side: [{ rect: [23, 15, 1, 3] }] },
  anime: { front: [], paint: animeFront(), side: [{ rect: [23, 15, 1, 3] }] },
};

export const VIEWS: Record<'front' | 'back' | 'side', Part[]> = {
  front: [
    part('legL', 'legL', 'shell', { rect: [12, 31, 2, 4] }),
    part('legR', 'legR', 'shell', { rect: [18, 31, 2, 4] }),
    part('bootL', 'legL', 'white', { round: [10, 35, 5, 3, 1] }),
    part('bootR', 'legR', 'white', { round: [17, 35, 5, 3, 1] }),
    part('armL', 'body', 'shell', { rect: [7, 27, 3, 2] }),
    part('armR', 'body', 'shell', { rect: [22, 27, 3, 2] }),
    part('mittenL', 'body', 'white', { round: [4, 27, 4, 4, 1] }),
    part('mittenR', 'body', 'white', { round: [24, 27, 4, 4, 1] }),
    part('torso', 'body', 'shell', { round: [10, 26, 12, 6, 1] }),
    part('chest', 'body', 'white', { rect: [13, 28, 6, 2] }),
    part('earL', 'body', 'shell', { round: [1, 13, 3, 7, 1] }),
    part('earR', 'body', 'shell', { round: [28, 13, 3, 7, 1] }),
    ...antenna,
    part('head', 'body', 'shell', { round: [4, 8, 24, 18, 2] }),
    flat('visor', 'body', 'visor', { round: [7, 11, 18, 12, 1] }),
    flat('glare', 'body', 'glare', {
      px: [
        [10, 12],
        [11, 12],
        [12, 12],
        [9, 13],
        [9, 14],
      ],
    }),
  ],
  back: [
    part('legL', 'legL', 'shell', { rect: [12, 31, 2, 4] }),
    part('legR', 'legR', 'shell', { rect: [18, 31, 2, 4] }),
    part('bootL', 'legL', 'white', { round: [10, 35, 5, 3, 1] }),
    part('bootR', 'legR', 'white', { round: [17, 35, 5, 3, 1] }),
    part('armL', 'body', 'shell', { rect: [7, 27, 3, 2] }),
    part('armR', 'body', 'shell', { rect: [22, 27, 3, 2] }),
    part('mittenL', 'body', 'white', { round: [4, 27, 4, 4, 1] }),
    part('mittenR', 'body', 'white', { round: [24, 27, 4, 4, 1] }),
    part('torso', 'body', 'shell', { round: [10, 26, 12, 6, 1] }),
    part('earL', 'body', 'shell', { round: [1, 13, 3, 7, 1] }),
    part('earR', 'body', 'shell', { round: [28, 13, 3, 7, 1] }),
    ...antenna,
    part('head', 'body', 'shell', { round: [4, 8, 24, 18, 2] }),
    part('backPanel', 'body', 'shellDark', { round: [9, 12, 14, 10, 1] }, { shade: false }),
    flat('vent1', 'body', 'outline', { rect: [12, 15, 8, 1] }),
    flat('vent2', 'body', 'outline', { rect: [12, 18, 8, 1] }),
  ],
  // Facing right; "left" is this view mirrored.
  side: [
    part('legBack', 'legB', 'shellDark', { rect: [13, 31, 2, 4] }, { shade: false }),
    part('bootBack', 'legB', 'white', { round: [12, 35, 5, 3, 1] }),
    part('legFront', 'legF', 'shell', { rect: [17, 31, 2, 4] }),
    part('bootFront', 'legF', 'white', { round: [16, 35, 6, 3, 1] }),
    part('torso', 'body', 'shell', { round: [11, 26, 10, 6, 1] }),
    ...antenna,
    part('head', 'body', 'shell', { round: [8, 8, 16, 18, 2] }),
    flat('visorEdge', 'body', 'visor', { rect: [22, 11, 2, 12] }),
    part('ear', 'body', 'shell', { round: [12, 13, 5, 6, 1] }),
    part('arm', 'arm', 'shell', { rect: [15, 27, 2, 2] }),
    part('mitten', 'arm', 'white', { round: [14, 28, 4, 4, 1] }),
  ],
};

export type ViewName = 'front' | 'back' | 'side';
export type FrameName = 'stand' | 'stepL' | 'stepR';

/** Per-frame offsets by part group. A step lifts the body one pixel and one foot with it. */
export const FRAMES: Record<ViewName, Record<FrameName, Record<string, [number, number]>>> = {
  front: { stand: {}, stepL: { body: [0, -1], legL: [0, -1] }, stepR: { body: [0, -1], legR: [0, -1] } },
  back: { stand: {}, stepL: { body: [0, -1], legL: [0, -1] }, stepR: { body: [0, -1], legR: [0, -1] } },
  side: {
    stand: {},
    stepL: { body: [0, -1], arm: [-1, -1], legF: [1, 0], legB: [-1, 0] },
    stepR: { body: [0, -1], arm: [1, -1], legF: [-1, 0], legB: [1, 0] },
  },
};

export type ExpressionName = 'blank' | 'open' | 'closed' | 'happy' | 'calm' | 'wink';

/** Eyes drawn on the visor; front and side views each have their own layout. */
export const EXPRESSIONS: Record<ExpressionName, { front: Shape[]; side: Shape[]; blush?: Shape[] }> = {
  blank: { front: [], side: [] },
  open: { front: [{ rect: [11, 15, 2, 3] }, { rect: [19, 15, 2, 3] }], side: [{ rect: [23, 15, 1, 3] }] },
  closed: { front: [{ rect: [10, 17, 4, 1] }, { rect: [18, 17, 4, 1] }], side: [{ rect: [22, 17, 2, 1] }] },
  happy: {
    front: [
      {
        px: [
          [10, 17],
          [11, 16],
          [12, 16],
          [13, 17],
          [18, 17],
          [19, 16],
          [20, 16],
          [21, 17],
        ],
      },
    ],
    side: [
      {
        px: [
          [22, 17],
          [23, 16],
        ],
      },
    ],
    blush: [{ rect: [8, 19, 2, 1] }, { rect: [22, 19, 2, 1] }],
  },
  calm: { front: [{ rect: [11, 16, 2, 2] }, { rect: [19, 16, 2, 2] }], side: [{ rect: [23, 16, 1, 2] }] },
  wink: {
    front: [
      { rect: [11, 15, 2, 3] },
      {
        px: [
          [18, 17],
          [19, 16],
          [20, 16],
          [21, 17],
        ],
      },
    ],
    side: [{ rect: [23, 15, 1, 3] }],
  },
};

/** Shell colors on offer when creating or restyling a MEGA (see also shared/config/looks.ts COLORS). */
export const SHELL_COLORS: Record<string, string> = { teal: '#2FB8B0', coral: '#F2766B', violet: '#8E6CE0', sun: '#F2B33D', sky: '#5B8DEF', leaf: '#5BBF6A' };

/** Signature decals: 3x3 flat paint on the top-right corner of the head bezel (legacy; stickers replace these). */
export const DECAL_ANCHOR: [number, number] = [22, 8];
export const DECALS: Record<string, string[]> = {
  star: ['.#.', '###', '#.#'],
  heart: ['#.#', '###', '.#.'],
  leaf: ['.##', '###', '##.'],
  bolt: ['.##', '.#.', '##.'],
};

/** The badge sits on a white tile so the navy outline reads on dark themes. */
export const BADGE = { pad: 2, background: '#FFFFFF' };
export const BADGE_PARTS = ['earL', 'earR', 'antennaStem', 'antennaTip', 'head', 'visor', 'glare', 'decal', 'eyes', 'blush', 'sticker', 'stickerBacking'];

/** Sticker box on the head (G1 renders a simple code-drawn placeholder per id; Muse art comes later). */
export const STICKER = { anchor: [20, 3] as [number, number], size: [12, 12] as [number, number] };

/** Code-drawn stand-ins for each sticker id, an 8x8 core shape placed at STICKER.anchor + [2,2]. */
export const STICKER_STANDINS: Record<string, { color: string; rows: string[] }> = {
  star: { color: '#FFD54A', rows: ['...##...', '...##...', '########', '.######.', '..####..', '.######.', '.##..##.', '##....##'] },
  heart: { color: '#FF6B8B', rows: ['........', '.##..##.', '########', '########', '########', '.######.', '..####..', '...##...'] },
  leaf: { color: '#5BBF6A', rows: ['....####', '..######', '.#######', '.######.', '.#####..', '.###....', '##......', '#.......'] },
  bolt: { color: '#FFB020', rows: ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.##.....', '#.......'] },
};
