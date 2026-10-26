// Shared by HQ and rooms: tile routes and one walking step.
const tileKey = (p) => p[0] + ',' + p[1];
// Shortest 4-way path from -> to (excluding from). isOpen(x, y) says whether a tile is walkable.
function route(from, to, isOpen) {
  const prev = {}; prev[tileKey(from)] = null;
  const queue = [from];
  while (queue.length) {
    const c = queue.shift();
    if (tileKey(c) === tileKey(to)) break;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const n = [c[0] + dx, c[1] + dy];
      if (!isOpen(n[0], n[1]) || tileKey(n) in prev) return;
      prev[tileKey(n)] = c; queue.push(n);
    });
  }
  if (!(tileKey(to) in prev)) return null;
  const path = [];
  for (let c = to; c && tileKey(c) !== tileKey(from); c = prev[tileKey(c)]) path.unshift(c);
  return path;
}
// Advance a walker { x, y, path, face, walked, tiles } by `step` art pixels; returns true on arrival.
function walk(m, tile, step) {
  const gx = m.path[0][0] * tile, gy = m.path[0][1] * tile;
  const dx = Math.sign(gx - m.x), dy = Math.sign(gy - m.y);
  m.face = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'front' : 'back';
  m.x += dx * step; m.y += dy * step; m.walked += step;
  if (m.x !== gx || m.y !== gy) return false;
  m.path = m.path.slice(1); m.tiles += 1;
  return m.path.length === 0;
}
// Which sprite frame a walker shows: a step mid-tile, alternating feet per tile.
function walkFrame(m, tile) {
  const p = m.walked % tile;
  return m.path.length && p >= tile / 4 && p < (tile * 3) / 4 ? (m.tiles % 2 ? 'stepR' : 'stepL') : 'stand';
}
