// The HQ room's layout (canvas Screen 2, board HQ), copied from design/mega-screens/assets/hq/hq.json with the room
// art (assets/images/hq/hq_room.png, 10×13 tiles of 32px): where each station stands (the tile a MEGA works on,
// which way it faces there, and the tap area as [x, y, w, h] in tiles), the room doors on the bottom wall, and which
// tiles can be walked. Station ids are the contract's (`STATIONS`; the board's `frontDoor` is `door`). Copied data:
// when the board's hq.json changes, copy it here too.
import type { Station } from '@shared/domain/enums';

export type Face = 'front' | 'back' | 'left' | 'right';
export type StationSpot = { tile: readonly [number, number]; face: Face; label: string; hit: readonly [number, number, number, number] };

const stations: Record<Station, StationSpot> = {
  desk: { tile: [1, 3], face: 'back', label: 'Desk', hit: [1, 2, 2, 1] },
  calendar: { tile: [4, 2], face: 'back', label: 'Calendar', hit: [4, 0, 1, 2] },
  bookshelf: { tile: [7, 3], face: 'back', label: 'Bookshelf', hit: [7, 0, 2, 3] },
  fridge: { tile: [8, 4], face: 'right', label: 'Fridge', hit: [9, 3, 1, 2] },
  charger: { tile: [5, 7], face: 'front', label: 'Charger', hit: [5, 7, 1, 1] },
  rug: { tile: [2, 9], face: 'front', label: 'Toy rug', hit: [1, 8, 3, 3] },
  mailbox: { tile: [8, 10], face: 'back', label: 'Mailbox', hit: [8, 9, 1, 1] },
  door: { tile: [4, 11], face: 'front', label: 'Front door', hit: [4, 12, 2, 1] },
};

export const HQ_LAYOUT = {
  tile: 32,
  cols: 10,
  rows: 13,
  stations,
  /** Room doors on the bottom wall, left to right; the app gives them to family members in order. */
  doors: [
    [1, 12],
    [2, 12],
    [7, 12],
  ] as readonly (readonly [number, number])[],
  /** '1' = walkable, one string per row (top to bottom). */
  walkable: ['0000000000', '0000000000', '0001111001', '1111111110', '1111100110', '1111111111', '1111111111', '1111111111', '1111111111', '1111111101', '1111111111', '1111111110', '0000000000'],
} as const;

export type Tile = readonly [number, number];

export const isWalkable = ([x, y]: Tile): boolean => x >= 0 && y >= 0 && x < HQ_LAYOUT.cols && y < HQ_LAYOUT.rows && HQ_LAYOUT.walkable[y][x] === '1';

/** The shortest 4-way path from `from` to `to` over walkable tiles (both ends included), or `null` if there's
 * none. The board's walker does the same breadth-first search. */
export function route(from: Tile, to: Tile): Tile[] | null {
  const key = ([x, y]: Tile) => y * HQ_LAYOUT.cols + x;
  if (!isWalkable(from) || !isWalkable(to)) return null;
  const prev = new Map<number, Tile | null>([[key(from), null]]);
  const queue: Tile[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur[0] === to[0] && cur[1] === to[1]) {
      const path: Tile[] = [];
      for (let t: Tile | null = cur; t; t = prev.get(key(t)) ?? null) path.unshift(t);
      return path;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next: Tile = [cur[0] + dx, cur[1] + dy];
      if (isWalkable(next) && !prev.has(key(next))) {
        prev.set(key(next), cur);
        queue.push(next);
      }
    }
  }
  return null;
}

/** Which way a MEGA faces stepping from `a` to `b`. */
export function faceToward(a: Tile, b: Tile): Face {
  if (b[0] > a[0]) return 'right';
  if (b[0] < a[0]) return 'left';
  return b[1] < a[1] ? 'back' : 'front';
}
