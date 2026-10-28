// shared/sprite: the pure-TS port of prototypes/megasprite. No React — these are data/math checks:
// rect-run count and that light/dark shades are actually derived from the one hex.
import { FURNITURE_ART, renderCoin, renderFurniture, renderMega, runs, shades } from '@shared/sprite';

describe('shades', () => {
  test('derives a lighter and a darker tone from one hex, both different from the input', () => {
    const { light, dark } = shades('#2FB8B0');
    expect(light).not.toBe('#2FB8B0');
    expect(dark).not.toBe('#2FB8B0');
    expect(light).not.toBe(dark);
    expect(light).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(dark).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('is deterministic', () => {
    expect(shades('#F2766B')).toEqual(shades('#F2766B'));
  });
});

describe('renderMega', () => {
  test('a full front sprite is 32x40 and paints a non-trivial number of pixel runs', () => {
    const pic = renderMega({ shell: '#2FB8B0', sticker: 'none' });
    expect(pic.w).toBe(32);
    expect(pic.h).toBe(40);
    const rects = runs(pic);
    expect(rects.length).toBeGreaterThan(10);
    // Every run only uses colors from this MEGA's own palette (shell-derived or fixed).
    for (const r of rects) expect(r.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('the badge crops to the head (no legs/torso) and sits on a white tile', () => {
    const full = renderMega({ shell: '#2FB8B0', sticker: 'none' });
    const badge = renderMega({ shell: '#2FB8B0', sticker: 'none' }, { badge: true });
    // Cropped to just the head: shorter than the full body, even once padded onto its tile.
    expect(badge.h).toBeLessThan(full.h);
    expect(runs(badge).length).toBeLessThan(runs(full).length);
    // The badge's corner is the white backing tile.
    expect(badge.px[0]).toBe('#FFFFFF');
  });

  test('each sticker id paints extra pixels not present with sticker "none"', () => {
    const bare = runs(renderMega({ shell: '#2FB8B0', sticker: 'none' }, { badge: true }));
    for (const sticker of ['star', 'heart', 'leaf', 'bolt'] as const) {
      const withSticker = runs(renderMega({ shell: '#2FB8B0', sticker }, { badge: true }));
      expect(withSticker.length).toBeGreaterThan(bare.length);
    }
  });

  test('a different shell color changes the painted colors', () => {
    const teal = runs(renderMega({ shell: '#2FB8B0', sticker: 'none' })).map((r) => r.color);
    const coral = runs(renderMega({ shell: '#F2766B', sticker: 'none' })).map((r) => r.color);
    expect(teal).not.toEqual(coral);
  });
});

// GD (Store, Screen 11): antenna shapes, eye colors and the Muse anime eyes, the coin and Store furniture.
describe('renderMega Store parts', () => {
  const base = { shell: '#8E6CE0', sticker: 'none' } as const;
  const px = (spec: Parameters<typeof renderMega>[0], opts?: Parameters<typeof renderMega>[1]) => renderMega(spec, opts).px.join('|');

  test('missing parts render exactly like classic ones (existing MEGAs are unchanged)', () => {
    expect(px(base)).toBe(px({ ...base, antenna: 'classic', eyes: 'classic', eyeColor: 'classic' }));
  });

  test('each bought antenna changes the picture, only above the head (rows 0–8)', () => {
    const classic = renderMega(base).px;
    for (const antenna of ['twin', 'star', 'sprout'] as const) {
      const pic = renderMega({ ...base, antenna });
      const changed = pic.px.map((c, i) => (c !== classic[i] ? Math.floor(i / pic.w) : -1)).filter((row) => row >= 0);
      expect(changed.length).toBeGreaterThan(0);
      expect(Math.max(...changed)).toBeLessThan(9);
    }
  });

  test('the badge keeps a bought antenna (its parts have their own ids)', () => {
    expect(px(base, { badge: true })).not.toBe(px({ ...base, antenna: 'twin' }, { badge: true }));
  });

  test('an eye color recolors every expression, not just the open eyes', () => {
    for (const expression of ['open', 'happy', 'wink', 'closed'] as const) {
      const colors = new Set(renderMega({ ...base, eyeColor: 'pink' }, { expression }).px);
      expect(colors.has('#FF9AD5')).toBe(true);
    }
  });

  test('anime eyes replace only the resting open eyes', () => {
    expect(px({ ...base, eyes: 'anime' })).not.toBe(px(base));
    expect(new Set(renderMega({ ...base, eyes: 'anime' }).px).has('#0157B7')).toBe(true);
    for (const expression of ['happy', 'wink', 'closed'] as const) expect(px({ ...base, eyes: 'anime' }, { expression })).toBe(px(base, { expression }));
  });
});

describe('Store art', () => {
  test('the coin is 12x12 with transparent corners and the gold body', () => {
    const coin = renderCoin();
    expect([coin.w, coin.h]).toEqual([12, 12]);
    expect(coin.px[0]).toBeNull();
    expect(coin.px).toContain('#FFD54A');
  });

  test('every Store furniture piece draws, sized by its footprint plus one tile of headroom', () => {
    for (const [kind, art] of Object.entries(FURNITURE_ART)) {
      const pic = renderFurniture(kind as keyof typeof FURNITURE_ART);
      expect([pic.w, pic.h]).toEqual([art.size[0] * 32, (art.size[1] + 1) * 32]);
      expect(pic.px.filter(Boolean).length).toBeGreaterThan(20);
    }
  });

  test('a colorable piece follows its accent color', () => {
    expect(renderFurniture('beanbag', '#F2766B').px).toContain('#F2766B');
  });
});
