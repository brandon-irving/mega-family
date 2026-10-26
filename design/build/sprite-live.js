// Shared by boards that draw MEGAs live from template data (LOOKS, STICKER_ART, shades()).
function paletteFor(hex) {
  const { light, dark } = shades(hex);
  return { ...LOOKS.fixed, shell: hex, shellLight: light, shellDark: dark };
}
// Pixel runs -> positioned boxes at `scale`, optionally only rows above `maxRow` (head crops).
function draw(hex, face, scale, maxRow) {
  const pal = paletteFor(hex);
  const runs = [...LOOKS.body, ...(LOOKS.faces[face] || [])].filter((r) => maxRow === undefined || r[1] < maxRow);
  return runs.map(([x, y, w, k]) => ({ l: x * scale, t: y * scale, w: w * scale, h: scale, c: pal[k] }));
}
function sprite(hex, face, sticker, scale, maxRow) {
  const [gw, gh] = LOOKS.grid;
  return { rects: draw(hex, face, scale, maxRow), hasSticker: sticker !== 'none', sticker: sticker === 'none' ? '' : '/_blob/' + STICKER_ART[sticker], w: gw * scale, h: gh * scale };
}
// Dark or light text on a coloured button, whichever reads better.
function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#0C0E11' : '#FFFFFF';
}

