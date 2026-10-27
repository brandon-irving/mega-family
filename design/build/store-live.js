// Store parts on top of sprite-live.js: a MEGA with a bought antenna shape, eye design and eye colour (STORE comes
// from prototypes/megasprite → assets/looks/store.json), and the pixel Mega Bucks coin.
function lookPalette(hex, look) {
  const pal = Object.assign(paletteFor(hex), STORE.colors);
  // A bought eye colour recolours the "eye" key, so every face (open, happy, wink, closed) follows.
  if (look && look.eyeColor && STORE.eyeColors[look.eyeColor]) pal.eye = STORE.eyeColors[look.eyeColor];
  return pal;
}
// Like draw(), but swaps the antenna rows, the resting eyes and the eye colour for the look's Store parts.
function drawLook(hex, face, look, scale, maxRow) {
  const pal = lookPalette(hex, look);
  const ant = look && look.antenna && look.antenna !== 'classic' ? STORE.antennas[look.antenna] : null;
  const eyes = face === 'open' && look && look.eyes && look.eyes !== 'classic' ? STORE.eyes[look.eyes] : null;
  const body = ant ? LOOKS.body.filter((r) => r[1] >= STORE.antennaRows).concat(ant) : LOOKS.body;
  const runs = body.concat(eyes || LOOKS.faces[face] || []).filter((r) => maxRow === undefined || r[1] < maxRow);
  return runs.map(([x, y, w, k]) => ({ l: x * scale, t: y * scale, w: w * scale, h: scale, c: pal[k] }));
}
function spriteLook(hex, face, look, scale, maxRow) {
  const [gw, gh] = LOOKS.grid;
  const sticker = (look && look.sticker) || 'none';
  return { rects: drawLook(hex, face, look, scale, maxRow), hasSticker: sticker !== 'none', sticker: sticker === 'none' ? '' : '/_blob/' + STICKER_ART[sticker], w: gw * scale, h: (maxRow || gh) * scale };
}

// The Mega Bucks coin: 12×12 art pixels with an "M", outlined in the MEGA navy.
const COIN_ROWS = [
  '...oooooo...',
  '.ooLLLLLLoo.',
  '.oLyyyyyyDo.',
  'oLyMyyyyMyDo',
  'oLyMMyyMMyDo',
  'oLyMyMMyMyDo',
  'oLyMyyyyMyDo',
  'oLyMyyyyMyDo',
  'oLyyyyyyyyDo',
  '.oyyyyyyyDo.',
  '.ooDDDDDDoo.',
  '...oooooo...',
];
const COIN_COLORS = { o: '#1B1A3A', L: '#FFF1A8', y: '#FFD54A', D: '#E0A21B', M: '#8A5A00' };
function coin(scale) {
  const rects = [];
  COIN_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const k = row[x];
      let n = 1;
      while (row[x + n] === k) n++;
      if (k !== '.') rects.push({ l: x * scale, t: y * scale, w: n * scale, h: scale, c: COIN_COLORS[k] });
      x += n;
    }
  });
  return { rects, size: 12 * scale };
}
