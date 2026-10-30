import { EXPRESSIONS, FURNITURE_ART, renderCoin, renderFurniture, renderMega, runs, type ExpressionName, type FrameName, type Picture, type View } from '@shared/sprite';
import type { FurnitureKindId } from '@shared/config/store';
import { pixelPaths } from './pixelPaths';

function rasterize(paths: ReturnType<typeof pixelPaths>, w: number, h: number): Picture['px'] {
  const pixels = new Array(w * h).fill(null);
  for (const { color, d } of paths) {
    const rectangles = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)];
    expect(rectangles.map(([command]) => command).join('')).toBe(d);
    for (const [, x, y, width, back] of rectangles) {
      expect(width).toBe(back);
      for (let i = 0; i < Number(width); i++) {
        const index = Number(y) * w + Number(x) + i;
        // Every painted pixel belongs to exactly one run; transparent pixels remain untouched.
        expect(pixels[index]).toBeNull();
        pixels[index] = color;
      }
    }
  }
  return pixels;
}

test('grouped SVG paths preserve every pixel for sprites, badges, coins and furniture', () => {
  const pictures: Picture[] = [renderCoin(), ...Object.keys(FURNITURE_ART).map((id) => renderFurniture(id as FurnitureKindId))];
  for (const view of ['front', 'back', 'left', 'right'] as View[])
    for (const frame of ['stand', 'stepL', 'stepR'] as FrameName[])
      for (const expression of Object.keys(EXPRESSIONS) as ExpressionName[])
        for (const badge of [false, true]) pictures.push(renderMega({ shell: '#2FB8B0', sticker: 'star' }, { view, frame, expression, badge }));
  for (const picture of pictures) {
    const paths = pixelPaths(picture);
    expect(rasterize(paths, picture.w, picture.h)).toEqual(picture.px);
  }
});

test('one front-facing sprite uses 14 drawing nodes instead of 252', () => {
  const picture = renderMega({ shell: '#2FB8B0', sticker: 'none' });
  expect(runs(picture)).toHaveLength(252);
  expect(pixelPaths(picture)).toHaveLength(14);
});

test('transparent and single-color pictures need zero and one drawing nodes', () => {
  expect(pixelPaths({ w: 3, h: 2, px: Array(6).fill(null) })).toEqual([]);
  const picture = { w: 3, h: 2, px: Array(6).fill('#123456') };
  const paths = pixelPaths(picture);
  expect(paths).toHaveLength(1);
  expect(rasterize(paths, 3, 2)).toEqual(picture.px);
});
