// G2 contrast fix: "own message bubble white on #2FB8B0 is 2.44:1" (the Midnight theme's own accent,
// Bubble.tsx's background for the viewer's own messages) — readableOn must pick a text color that
// clears WCAG AA's 4.5:1 body-text threshold on every accent the app can actually put text on: the six
// MEGA shell-color presets (shared/config/looks.ts COLORS, selectable via "Match my MEGA") plus extreme
// custom hexes from the color picker (any #rrggbb is allowed there).
import { describe, expect, test } from 'vitest';
import { contrastRatio, readableOn, CONTRAST_TEXT, THEMES } from './theme';
import { COLORS } from './looks';

const WCAG_AA_BODY_TEXT = 4.5;

describe('contrastRatio', () => {
  test('black on white is the maximum, 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  test('a color against itself is the minimum, 1:1', () => {
    expect(contrastRatio('#2FB8B0', '#2FB8B0')).toBeCloseTo(1, 5);
  });

  test('is symmetric', () => {
    expect(contrastRatio('#2FB8B0', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#2FB8B0'), 10);
  });

  test('reproduces the G2-reported ratio: white text on the Midnight theme accent is ~2.44:1', () => {
    expect(contrastRatio(THEMES.midnight.accent, '#FFFFFF')).toBeCloseTo(2.44, 1);
  });
});

describe('readableOn', () => {
  test.each(Object.entries(COLORS))('MEGA shell preset "%s" (%s) reaches WCAG AA (≥4.5:1)', (_name, hex) => {
    const text = readableOn(hex);
    expect([CONTRAST_TEXT.light, CONTRAST_TEXT.dark]).toContain(text);
    expect(contrastRatio(hex, text)).toBeGreaterThanOrEqual(WCAG_AA_BODY_TEXT);
  });

  test.each(Object.values(THEMES))('theme "$label" own accent reaches WCAG AA (≥4.5:1)', ({ accent }) => {
    expect(contrastRatio(accent, readableOn(accent))).toBeGreaterThanOrEqual(WCAG_AA_BODY_TEXT);
  });

  test('extreme custom hex: pure yellow picks the dark token', () => {
    expect(readableOn('#FFFF00')).toBe(CONTRAST_TEXT.dark);
    expect(contrastRatio('#FFFF00', readableOn('#FFFF00'))).toBeGreaterThanOrEqual(WCAG_AA_BODY_TEXT);
  });

  test('extreme custom hex: pure black picks the light token', () => {
    expect(readableOn('#000000')).toBe(CONTRAST_TEXT.light);
    expect(contrastRatio('#000000', readableOn('#000000'))).toBeGreaterThanOrEqual(WCAG_AA_BODY_TEXT);
  });

  test('the previously-broken case: Midnight theme accent now picks dark text, not white', () => {
    expect(readableOn(THEMES.midnight.accent)).toBe(CONTRAST_TEXT.dark);
  });
});
