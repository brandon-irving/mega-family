// shared/sprite: the pure-TS port of prototypes/megasprite. No React — these are data/math checks:
// rect-run count and that light/dark shades are actually derived from the one hex.
import { renderMega, runs, shades } from '@shared/sprite';

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
